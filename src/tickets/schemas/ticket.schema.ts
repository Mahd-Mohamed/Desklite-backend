import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { TicketStatus } from '../../common/enums/ticket-status.enum';
import { User } from '../../users/schemas/user.schema';

export type TicketDocument = Ticket & Document;

export enum TicketEventType {
  CREATED = 'CREATED',
  CLAIMED = 'CLAIMED',
  ASSIGNED = 'ASSIGNED',
  STATUS_CHANGED = 'STATUS_CHANGED',
  COMMENT = 'COMMENT',
}

@Schema({ _id: false })
export class TicketEvent {
  @Prop({ required: true, enum: TicketEventType })
  type!: TicketEventType;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  byId!: Types.ObjectId;

  @Prop({ required: false })
  message?: string;

  @Prop({ required: false, enum: TicketStatus })
  fromStatus?: TicketStatus;

  @Prop({ required: false, enum: TicketStatus })
  toStatus?: TicketStatus;

  @Prop({ type: Date, required: true, default: () => new Date() })
  createdAt!: Date;
}

export const TicketEventSchema = SchemaFactory.createForClass(TicketEvent);

@Schema({ timestamps: true })
export class Ticket {
  @Prop({ required: true })
  title!: string;

  @Prop({ required: true })
  description!: string;

  @Prop({ required: true, enum: TicketStatus, default: TicketStatus.OPEN })
  status!: TicketStatus;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  requesterId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: false })
  ownerId?: Types.ObjectId;

  @Prop({ type: Date, required: false })
  claimedAt?: Date;

  @Prop({ required: false })
  blockerReason?: string;

  @Prop({ required: false })
  nextAction?: string;

  @Prop({ type: Date, required: false })
  blockedAt?: Date;

  @Prop({ required: false })
  resolution?: string;

  @Prop({ type: Date, required: false })
  resolvedAt?: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: false })
  resolvedBy?: Types.ObjectId;

  @Prop({ type: Date, required: false })
  closedAt?: Date;

  @Prop({ type: [TicketEventSchema], default: [] })
  history!: TicketEvent[];
}

export const TicketSchema = SchemaFactory.createForClass(Ticket);

