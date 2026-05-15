import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, Repository } from 'typeorm';
import { ItemsService } from '../items/items.service';
import { Reservation } from '../reservations/entities/reservation.entity';
import { CreateLoanDto } from './dto/create-loan.dto';
import { Loan, LoanStatus } from './entities/loan.entity';

@Injectable()
export class LoansService {
  constructor(
    @InjectRepository(Loan)
    private readonly loanRepo: Repository<Loan>,
    @InjectRepository(Reservation)
    private readonly reservationRepo: Repository<Reservation>,
    private readonly itemsService: ItemsService,
    private readonly config: ConfigService,
  ) {}

  async create(dto: CreateLoanDto): Promise<Loan> {
    const dueAt = new Date(dto.dueAt);
    const loanedAt = new Date();
    const maxLoanDays = this.config.get<number>('loans.maxLoanDays', 30);

    if (dueAt <= loanedAt) {
      throw new BadRequestException('dueAt debe ser posterior a la fecha actual');
    }

    const diffDays = (dueAt.getTime() - loanedAt.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays > maxLoanDays) {
      throw new BadRequestException(`El préstamo no puede superar ${maxLoanDays} días`);
    }

    // R3: count active + overdue loans for this user
    const maxActive = this.config.get<number>('loans.maxActivePerUser', 3);
    const activeCount = await this.loanRepo.count({
      where: { userId: dto.userId, status: In([LoanStatus.ACTIVE, LoanStatus.OVERDUE]) },
    });
    if (activeCount >= maxActive) {
      throw new ConflictException(`El usuario ya tiene ${maxActive} préstamos activos o vencidos`);
    }

    // R2: item cannot be on an active or overdue loan
    await this.itemsService.findById(dto.itemId);
    const blockingLoan = await this.loanRepo.findOne({
      where: { itemId: dto.itemId, status: In([LoanStatus.ACTIVE, LoanStatus.OVERDUE]) },
    });
    if (blockingLoan) {
      throw new ConflictException(`El item ya está prestado (loanId: ${blockingLoan.id})`);
    }

    // R-B1.4: if pending reservations exist, only the queue head can take the loan
    const queueHead = await this.reservationRepo
      .createQueryBuilder('r')
      .where('r.itemId = :itemId', { itemId: dto.itemId })
      .andWhere('r.cancelledAt IS NULL')
      .andWhere('(r.expiresAt IS NULL OR r.expiresAt > :now)', { now: loanedAt })
      .orderBy('r.createdAt', 'ASC')
      .getOne();

    if (queueHead && queueHead.userId !== dto.userId) {
      throw new ForbiddenException(
        `El item tiene reservas pendientes. Solo el primer usuario en cola puede tomarlo`,
      );
    }
    if (queueHead && queueHead.userId === dto.userId) {
      await this.reservationRepo.update(queueHead.id, { cancelledAt: loanedAt });
    }

    const loan = this.loanRepo.create({
      userId: dto.userId,
      itemId: dto.itemId,
      loanedAt,
      dueAt,
      status: LoanStatus.ACTIVE,
      fineAmount: 0,
    });

    return this.loanRepo.save(loan);
  }

  async findAll(filters: {
    userId?: string;
    itemId?: string;
    status?: LoanStatus;
  }): Promise<Loan[]> {
    await this.syncOverdueStatus();

    const where: any = {};
    if (filters.userId) where.userId = filters.userId;
    if (filters.itemId) where.itemId = filters.itemId;
    if (filters.status) where.status = filters.status;

    return this.loanRepo.find({ where, relations: ['user', 'item'], order: { createdAt: 'DESC' } });
  }

  async findById(id: string): Promise<Loan> {
    const loan = await this.loanRepo.findOne({ where: { id }, relations: ['user', 'item'] });
    if (!loan) throw new NotFoundException('Préstamo no encontrado');
    await this.syncOverdueSingle(loan);
    return loan;
  }

  async returnLoan(id: string): Promise<Loan> {
    const loan = await this.findById(id);
    if (loan.status !== LoanStatus.ACTIVE && loan.status !== LoanStatus.OVERDUE) {
      throw new BadRequestException(`No se puede devolver un préstamo en estado ${loan.status}`);
    }
    loan.status = LoanStatus.RETURNED;
    loan.returnedAt = new Date();
    loan.fineAmount = this.calculateFine(loan);
    const saved = await this.loanRepo.save(loan);

    // R-B1.2: notify next person in the reservation queue
    await this.fulfillNextReservation(loan.itemId);

    return saved;
  }

  async markLost(id: string): Promise<Loan> {
    const loan = await this.findById(id);
    if (loan.status === LoanStatus.RETURNED || loan.status === LoanStatus.LOST) {
      throw new BadRequestException(
        `No se puede marcar como perdido un préstamo en estado ${loan.status}`,
      );
    }
    loan.status = LoanStatus.LOST;
    loan.fineAmount = this.calculateFine(loan);
    return this.loanRepo.save(loan);
  }

  // R-B1.2: fulfills the first pending reservation for an item when it is returned
  private async fulfillNextReservation(itemId: string): Promise<void> {
    const next = await this.reservationRepo
      .createQueryBuilder('r')
      .where('r.itemId = :itemId', { itemId })
      .andWhere('r.cancelledAt IS NULL')
      .andWhere('r.fulfilledAt IS NULL')
      .orderBy('r.createdAt', 'ASC')
      .getOne();

    if (next) {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 48 * 60 * 60 * 1000);
      await this.reservationRepo.update(next.id, { fulfilledAt: now, expiresAt });
    }
  }

  // R5: bulk-update active loans past dueAt → overdue on each read operation
  private async syncOverdueStatus(): Promise<void> {
    await this.loanRepo.update(
      { status: LoanStatus.ACTIVE, dueAt: LessThan(new Date()) },
      { status: LoanStatus.OVERDUE },
    );
  }

  private async syncOverdueSingle(loan: Loan): Promise<void> {
    if (loan.status === LoanStatus.ACTIVE && loan.dueAt < new Date()) {
      loan.status = LoanStatus.OVERDUE;
      await this.loanRepo.save(loan);
    }
  }

  private calculateFine(loan: Loan): number {
    const dailyRate = this.config.get<number>('loans.dailyFineRate', 0.5);
    const reference = loan.returnedAt ?? new Date();
    if (reference <= loan.dueAt) return 0;
    const overdueDays = Math.ceil(
      (reference.getTime() - loan.dueAt.getTime()) / (1000 * 60 * 60 * 24),
    );
    return parseFloat((overdueDays * dailyRate).toFixed(2));
  }
}
