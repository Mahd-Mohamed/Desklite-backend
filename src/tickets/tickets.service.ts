import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Ticket, TicketDocument, TicketEvent, TicketEventType } from './schemas/ticket.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { Role } from '../common/enums/role.enum';
import { TicketStatus } from '../common/enums/ticket-status.enum';

/** A ticket counts as overdue when it has been active (unresolved) for more than this many hours. */
export const OVERDUE_THRESHOLD_HOURS = 48;

const ACTIVE_STATUSES: TicketStatus[] = [
  TicketStatus.OPEN,
  TicketStatus.IN_PROGRESS,
  TicketStatus.BLOCKED,
];

const ALLOWED_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  [TicketStatus.OPEN]: [TicketStatus.IN_PROGRESS],
  [TicketStatus.IN_PROGRESS]: [TicketStatus.BLOCKED, TicketStatus.RESOLVED],
  [TicketStatus.BLOCKED]: [TicketStatus.IN_PROGRESS],
  [TicketStatus.RESOLVED]: [],
  [TicketStatus.CLOSED]: [],
};

@Injectable()
export class TicketsService {
  constructor(
    @InjectModel(Ticket.name) private ticketModel: Model<TicketDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  async create(createTicketDto: CreateTicketDto, requesterId: string): Promise<TicketDocument> {
    const newTicket = new this.ticketModel({
      ...createTicketDto,
      requesterId: new Types.ObjectId(requesterId),
      history: [
        {
          type: TicketEventType.CREATED,
          byId: new Types.ObjectId(requesterId),
          createdAt: new Date(),
        },
      ],
    });
    const saved = await newTicket.save();
    return this.findOne(saved._id.toString());
  }

  async findAll(user: { userId: string; role: Role }): Promise<TicketDocument[]> {
    const query: any = user.role === Role.EMPLOYEE ? { requesterId: new Types.ObjectId(user.userId) } : {};
    return this.ticketModel
      .find(query)
      .populate('requesterId', 'name email role')
      .populate('ownerId', 'name email role')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findAvailable(): Promise<TicketDocument[]> {
    return this.ticketModel
      .find({ ownerId: null, status: TicketStatus.OPEN })
      .populate('requesterId', 'name email role')
      .sort({ createdAt: 1 })
      .exec();
  }

  async findOne(id: string): Promise<TicketDocument> {
    const ticket = await this.ticketModel
      .findById(id)
      .populate('requesterId', 'name email role')
      .populate('ownerId', 'name email role')
      .populate('resolvedBy', 'name email role')
      .populate('history.byId', 'name email role')
      .exec();

    if (!ticket) {
      throw new NotFoundException(`Ticket with ID ${id} not found`);
    }

    return ticket;
  }

  async claim(id: string, userId: string): Promise<TicketDocument> {
    const ticket = await this.ticketModel.findById(id).exec();
    if (!ticket) {
      throw new NotFoundException(`Ticket with ID ${id} not found`);
    }
    if (ticket.ownerId) {
      throw new BadRequestException('Ticket has already been claimed by another support member');
    }
    if (ticket.status !== TicketStatus.OPEN) {
      throw new BadRequestException('Only OPEN tickets can be claimed');
    }

    ticket.ownerId = new Types.ObjectId(userId);
    ticket.claimedAt = new Date();
    this.pushEvent(ticket, { type: TicketEventType.CLAIMED, byId: new Types.ObjectId(userId) });
    await ticket.save();
    return this.findOne(id);
  }

  async changeStatus(id: string, userId: string, dto: UpdateStatusDto): Promise<TicketDocument> {
    const ticket = await this.ticketModel.findById(id).exec();
    if (!ticket) {
      throw new NotFoundException(`Ticket with ID ${id} not found`);
    }
    if (!ticket.ownerId || ticket.ownerId.toString() !== userId) {
      throw new ForbiddenException('Only the assigned owner can change the ticket status');
    }

    const allowed = ALLOWED_TRANSITIONS[ticket.status];
    if (!allowed.includes(dto.status as TicketStatus)) {
      throw new BadRequestException(
        `Cannot change status from ${ticket.status} to ${dto.status}`,
      );
    }

    const nextStatus = dto.status as TicketStatus;
    if (nextStatus === TicketStatus.BLOCKED) {
      if (!dto.blockerReason?.trim() || !dto.nextAction?.trim()) {
        throw new BadRequestException(
          'Blocking a ticket requires a blocker reason and the next action',
        );
      }
      ticket.blockerReason = dto.blockerReason.trim();
      ticket.nextAction = dto.nextAction.trim();
      ticket.blockedAt = new Date();
    }

    if (nextStatus === TicketStatus.RESOLVED) {
      if (!dto.resolution?.trim()) {
        throw new BadRequestException('Resolving a ticket requires a resolution note');
      }
      ticket.resolution = dto.resolution.trim();
      ticket.resolvedAt = new Date();
      ticket.resolvedBy = new Types.ObjectId(userId);
    }

    ticket.status = nextStatus;
    this.pushEvent(ticket, {
      type: TicketEventType.STATUS_CHANGED,
      byId: new Types.ObjectId(userId),
      fromStatus: ticket.status,
      toStatus: nextStatus,
      message:
        nextStatus === TicketStatus.RESOLVED
          ? `Resolution: ${dto.resolution?.trim()}`
          : nextStatus === TicketStatus.BLOCKED
            ? `Blocked: ${dto.blockerReason?.trim()} | Next action: ${dto.nextAction?.trim()}`
            : undefined,
    });
    await ticket.save();
    return this.findOne(id);
  }

  async addComment(id: string, userId: string, message: string): Promise<TicketDocument> {
    const ticket = await this.ticketModel.findById(id).exec();
    if (!ticket) {
      throw new NotFoundException(`Ticket with ID ${id} not found`);
    }

    this.pushEvent(ticket, {
      type: TicketEventType.COMMENT,
      byId: new Types.ObjectId(userId),
      message: message.trim(),
    });
    await ticket.save();
    return this.findOne(id);
  }

  async close(id: string, requesterId: string): Promise<TicketDocument> {
    const ticket = await this.ticketModel.findById(id).exec();
    if (!ticket) {
      throw new NotFoundException(`Ticket with ID ${id} not found`);
    }
    if (ticket.requesterId.toString() !== requesterId) {
      throw new ForbiddenException('Only the requester can confirm and close the ticket');
    }
    if (ticket.status !== TicketStatus.RESOLVED) {
      throw new BadRequestException('Only RESOLVED tickets can be closed');
    }

    ticket.status = TicketStatus.CLOSED;
    ticket.closedAt = new Date();
    this.pushEvent(ticket, {
      type: TicketEventType.STATUS_CHANGED,
      byId: new Types.ObjectId(requesterId),
      fromStatus: TicketStatus.RESOLVED,
      toStatus: TicketStatus.CLOSED,
    });
    await ticket.save();
    return this.findOne(id);
  }

  async assign(id: string, targetUserId: string, managerId: string): Promise<TicketDocument> {
    const ticket = await this.ticketModel.findById(id).exec();
    if (!ticket) {
      throw new NotFoundException(`Ticket with ID ${id} not found`);
    }
    if (ticket.status === TicketStatus.CLOSED) {
      throw new BadRequestException('Closed tickets cannot be assigned or reassigned');
    }

    const target = await this.userModel.findById(targetUserId).exec();
    if (!target) {
      throw new NotFoundException('Target user not found');
    }
    if (target.role !== Role.SUPPORT && target.role !== Role.MANAGER) {
      throw new BadRequestException('Tickets can only be assigned to SUPPORT or MANAGER staff');
    }

    const previousOwnerId = ticket.ownerId ? ticket.ownerId.toString() : null;
    if (previousOwnerId === targetUserId) {
      throw new BadRequestException(`Ticket is already assigned to ${target.name}`);
    }

    ticket.ownerId = new Types.ObjectId(targetUserId);
    if (!ticket.claimedAt) {
      ticket.claimedAt = new Date();
    }

    this.pushEvent(ticket, {
      type: TicketEventType.ASSIGNED,
      byId: new Types.ObjectId(managerId),
      message: previousOwnerId
        ? `Reassigned to ${target.name}`
        : `Assigned to ${target.name}`,
    });
    await ticket.save();
    return this.findOne(id);
  }

  async getStats() {
    const [total, open, inProgress, resolved, blocked, closed, unassigned] = await Promise.all([
      this.ticketModel.countDocuments().exec(),
      this.ticketModel.countDocuments({ status: TicketStatus.OPEN }).exec(),
      this.ticketModel.countDocuments({ status: TicketStatus.IN_PROGRESS }).exec(),
      this.ticketModel.countDocuments({ status: TicketStatus.RESOLVED }).exec(),
      this.ticketModel.countDocuments({ status: TicketStatus.BLOCKED }).exec(),
      this.ticketModel.countDocuments({ status: TicketStatus.CLOSED }).exec(),
      this.ticketModel.countDocuments({ ownerId: null, status: TicketStatus.OPEN }).exec(),
    ]);

    const overdueCutoff = new Date(Date.now() - OVERDUE_THRESHOLD_HOURS * 60 * 60 * 1000);
    const overdue = await this.ticketModel
      .countDocuments({ status: { $in: ACTIVE_STATUSES }, createdAt: { $lt: overdueCutoff } })
      .exec();

    return {
      total,
      open,
      inProgress,
      resolved,
      blocked,
      closed,
      unassigned,
      overdue,
      overdueThresholdHours: OVERDUE_THRESHOLD_HOURS,
    };
  }

  async getWorkload() {
    const staff = await this.userModel
      .find({ role: { $in: [Role.SUPPORT, Role.MANAGER] } })
      .select('name email role')
      .sort('name')
      .exec();

    const tickets = (await this.ticketModel
      .find({ ownerId: { $ne: null } })
      .select('ownerId status createdAt')
      .lean()
      .exec()) as unknown as Array<{ ownerId: Types.ObjectId; status: TicketStatus; createdAt: Date }>;

    const overdueCutoff = Date.now() - OVERDUE_THRESHOLD_HOURS * 60 * 60 * 1000;

    const workload = new Map<
      string,
      { userId: string; name: string; email: string; role: Role; active: number; overdue: number; total: number }
    >();
    for (const member of staff) {
      workload.set(member._id.toString(), {
        userId: member._id.toString(),
        name: member.name,
        email: member.email,
        role: member.role,
        active: 0,
        overdue: 0,
        total: 0,
      });
    }

    for (const t of tickets) {
      const key = t.ownerId.toString();
      const entry = workload.get(key);
      if (!entry) continue;
      entry.total += 1;
      if (ACTIVE_STATUSES.includes(t.status)) {
        entry.active += 1;
        if (t.createdAt.getTime() < overdueCutoff) {
          entry.overdue += 1;
        }
      }
    }

    return Array.from(workload.values()).sort((a, b) => b.active - a.active);
  }

  async getSupportStaff() {
    return this.userModel
      .find({ role: { $in: [Role.SUPPORT, Role.MANAGER] } })
      .select('name email role')
      .sort('name')
      .exec();
  }

  private pushEvent(ticket: TicketDocument, event: Partial<TicketEvent>): void {
    ticket.history.push({
      type: event.type!,
      byId: event.byId!,
      message: event.message,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      createdAt: new Date(),
    } as TicketEvent);
  }
}
