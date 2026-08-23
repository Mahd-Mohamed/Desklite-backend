import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateStatusDto {
  @IsIn(['IN_PROGRESS', 'BLOCKED', 'RESOLVED'])
  status!: 'IN_PROGRESS' | 'BLOCKED' | 'RESOLVED';

  @IsOptional()
  @IsString()
  @MinLength(3, { message: 'Blocker reason must be at least 3 characters' })
  @MaxLength(500)
  blockerReason?: string;

  @IsOptional()
  @IsString()
  @MinLength(3, { message: 'Next action must be at least 3 characters' })
  @MaxLength(500)
  nextAction?: string;

  @IsOptional()
  @IsString()
  @MinLength(5, { message: 'Resolution must be at least 5 characters' })
  @MaxLength(2000)
  resolution?: string;
}
