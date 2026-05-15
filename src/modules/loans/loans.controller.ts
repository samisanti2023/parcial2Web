import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CreateLoanDto } from './dto/create-loan.dto';
import { LoanStatus } from './entities/loan.entity';
import { LoansService } from './loans.service';

@ApiTags('loans')
@ApiBearerAuth()
@Controller('loans')
export class LoansController {
  constructor(private readonly loansService: LoansService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear préstamo' })
  create(@Body() dto: CreateLoanDto) {
    return this.loansService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar préstamos con filtros opcionales' })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'itemId', required: false })
  @ApiQuery({ name: 'status', enum: LoanStatus, required: false })
  findAll(
    @Query('userId') userId?: string,
    @Query('itemId') itemId?: string,
    @Query('status') status?: LoanStatus,
  ) {
    return this.loansService.findAll({ userId, itemId, status });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de préstamo' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.loansService.findById(id);
  }

  @Patch(':id/return')
  @ApiOperation({ summary: 'Marcar como devuelto y calcular multa' })
  returnLoan(@Param('id', ParseUUIDPipe) id: string) {
    return this.loansService.returnLoan(id);
  }

  @Patch(':id/mark-lost')
  @ApiOperation({ summary: 'Marcar como perdido' })
  markLost(@Param('id', ParseUUIDPipe) id: string) {
    return this.loansService.markLost(id);
  }
}
