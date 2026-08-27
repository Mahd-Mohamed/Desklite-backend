import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type NotificationDocument = Notification & Document;

export enum NotificationType {
  TICKET_CREATED = 'TICKET_CREATED',
  TICKET_ASSIGNED = 'TICKET_ASSIGNED',
  TICKET_CLAIMED = 'TICKET_CLAIMED',
  STATUS_CHANGED = 'STATUS_CHANGED',
  COMMENT = 'COMMENT',
  TICKET_CLOSED = 'TICKET_CLOSED',
}

@Schema({ timestamps: true })
export class Notification {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, enum: NotificationType })
  type!: NotificationType;

  @Prop({ type: Types.ObjectId, ref: 'Ticket', required: true })
  ticketId!: Types.ObjectId;

  @Prop({ required: true })
  title!: string;

  @Prop()
  message?: string;

  @Prop({ default: false, index: true })
  read!: boolean;

  @Prop()
  actionUrl?: string;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);
