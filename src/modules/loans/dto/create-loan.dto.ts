import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsUUID } from 'class-validator';

export class CreateLoanDto {
  @ApiProperty()
  @IsUUID()
  userId: string;

  @ApiProperty()
  @IsUUID()
  itemId: string;

  @ApiProperty({ example: '2026-06-14T10:00:00.000Z' })
  @IsISO8601()
  dueAt: string;
}
