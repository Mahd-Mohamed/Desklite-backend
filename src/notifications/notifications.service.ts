import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as nodemailer from 'nodemailer';
import {
  Notification,
  NotificationDocument,
  NotificationType,
} from './schemas/notification.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { EventsGateway } from '../common/events.gateway';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(
    @InjectModel(Notification.name)
    private notificationModel: Model<NotificationDocument>,
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
    private configService: ConfigService,
    private eventsGateway: EventsGateway,
  ) {}

  private getTransporter(): nodemailer.Transporter | null {
    const host = this.configService.get<string>('SMTP_HOST');
    const port = this.configService.get<number>('SMTP_PORT');
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');

    if (!host || !user || !pass) {
      if (!this.transporter) {
        this.logger.warn(
          'SMTP not configured — email notifications disabled. Set SMTP_HOST, SMTP_USER, SMTP_PASS in .env',
        );
      }
      return null;
    }

    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host,
        port: port ?? 587,
        secure: port === 465,
        auth: { user, pass },
      });
    }

    return this.transporter;
  }

  async notify(
    userId: string,
    type: NotificationType,
    ticketId: string,
    title: string,
    message?: string,
    sendEmail = true,
  ): Promise<NotificationDocument> {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:4200';
    const actionUrl = `${frontendUrl}/tickets/${ticketId}`;

    const notification = await this.notificationModel.create({
      userId: new Types.ObjectId(userId),
      type,
      ticketId: new Types.ObjectId(ticketId),
      title,
      message,
      actionUrl,
    });

    this.eventsGateway.emitToUser(userId, 'notification.created', notification);

    if (sendEmail) {
      this.sendEmail(userId, type, title, message, actionUrl).catch((err) =>
        this.logger.error(`Email notification failed: ${err.message}`),
      );
    }

    return notification;
  }

  private async sendEmail(
    userId: string,
    type: NotificationType,
    title: string,
    message: string | undefined,
    actionUrl: string,
  ): Promise<void> {
    const transport = this.getTransporter();
    if (!transport) return;

    const user = await this.userModel.findById(userId).select('email name').exec();
    if (!user) {
      this.logger.warn(`Cannot send email — user ${userId} not found`);
      return;
    }

    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:4200';
    const smtpUser = this.configService.get<string>('SMTP_USER')!;
    const smtpFrom = this.configService.get<string>('SMTP_FROM') || `iCarer <${smtpUser}>`;

    const typeColors: Record<string, string> = {
      TICKET_CREATED: '#7c3aed',
      TICKET_ASSIGNED: '#2563eb',
      TICKET_CLAIMED: '#059669',
      STATUS_CHANGED: '#d97706',
      COMMENT: '#6366f1',
      TICKET_CLOSED: '#6b7280',
    };

    const typeLabels: Record<string, string> = {
      TICKET_CREATED: 'New Ticket',
      TICKET_ASSIGNED: 'Assigned to You',
      TICKET_CLAIMED: 'Ticket Claimed',
      STATUS_CHANGED: 'Status Updated',
      COMMENT: 'New Comment',
      TICKET_CLOSED: 'Ticket Closed',
    };

    const badgeColor = typeColors[type] || '#6366f1';
    const badgeLabel = typeLabels[type] || type;

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#7c3aed 0%,#2563eb 100%);padding:28px 32px;">
            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:600;">iCarer</h1>
            <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">IT Ticketing System</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding-bottom:20px;">
                  <span style="display:inline-block;background:${badgeColor};color:#fff;font-size:12px;font-weight:600;padding:4px 12px;border-radius:20px;text-transform:uppercase;letter-spacing:0.5px;">${badgeLabel}</span>
                </td>
              </tr>
              <tr>
                <td style="padding-bottom:12px;">
                  <h2 style="margin:0;color:#1e293b;font-size:20px;font-weight:600;">${title}</h2>
                </td>
              </tr>
              ${message ? `<tr><td style="padding-bottom:20px;"><p style="margin:0;color:#64748b;font-size:15px;line-height:1.6;">${message}</p></td></tr>` : ''}
              <tr>
                <td style="padding-top:8px;">
                  <a href="${actionUrl}" style="display:inline-block;background:#7c3aed;color:#fff;font-size:15px;font-weight:600;padding:12px 28px;border-radius:8px;text-decoration:none;">View Ticket</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc;padding:20px 32px;border-top:1px solid #e2e8f0;">
            <p style="margin:0;color:#94a3b8;font-size:12px;text-align:center;">
              You received this because you are part of the iCarer team.
              <br>
              <a href="${frontendUrl}/notifications" style="color:#7c3aed;text-decoration:none;">Notification Settings</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    try {
      await transport.sendMail({
        from: smtpFrom,
        to: user.email,
        subject: `[iCarer] ${title}`,
        html,
      });
      this.logger.log(`Email sent to ${user.email}: ${title}`);
    } catch (err: any) {
      this.logger.error(`Email send failed: ${err.message}`);
    }
  }

  async findAllForUser(userId: string, unreadOnly = false): Promise<NotificationDocument[]> {
    const query: any = { userId: new Types.ObjectId(userId) };
    if (unreadOnly) query.read = false;

    return this.notificationModel
      .find(query)
      .populate('ticketId', 'title status')
      .sort({ createdAt: -1 })
      .limit(50)
      .exec();
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.notificationModel.countDocuments({
      userId: new Types.ObjectId(userId),
      read: false,
    }).exec();
  }

  async markAsRead(id: string, userId: string): Promise<NotificationDocument | null> {
    return this.notificationModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), userId: new Types.ObjectId(userId) },
        { read: true },
        { new: true },
      )
      .exec();
  }

  async markAllAsRead(userId: string): Promise<void> {
    await this.notificationModel.updateMany(
      { userId: new Types.ObjectId(userId), read: false },
      { read: true },
    ).exec();
  }
}
