import { IsMongoId } from 'class-validator';

export class AssignTicketDto {
  @IsMongoId({ message: 'userId must be a valid user id' })
  userId!: string;
}
