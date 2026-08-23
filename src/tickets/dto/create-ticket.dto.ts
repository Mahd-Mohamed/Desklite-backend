import { IsNotEmpty, IsString } from 'class-validator';

export class CreateTicketDto {
  @IsNotEmpty()
  @IsString()
  title!: string;

  @IsNotEmpty()
  @IsString()
  description!: string;
}
