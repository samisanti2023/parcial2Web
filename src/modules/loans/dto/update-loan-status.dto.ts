import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { LoanStatus } from '../entities/loan.entity';

export class UpdateLoanStatusDto {
  @ApiProperty({ enum: LoanStatus })
  @IsEnum(LoanStatus)
  status: LoanStatus;
}
