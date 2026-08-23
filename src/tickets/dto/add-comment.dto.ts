import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class AddCommentDto {
  @IsNotEmpty()
  @IsString()
  @MinLength(2)
  @MaxLength(2000)
  message!: string;
}
