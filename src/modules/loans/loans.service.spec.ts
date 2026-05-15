import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { ItemsService } from '../items/items.service';
import { Reservation } from '../reservations/entities/reservation.entity';
import { CreateLoanDto } from './dto/create-loan.dto';
import { Loan, LoanStatus } from './entities/loan.entity';
import { LoansService } from './loans.service';

// ─── helpers ────────────────────────────────────────────────────────────────

function makeQb(overrides: Partial<{ getOne: any; getMany: any }> = {}) {
  const qb: any = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(overrides.getOne ?? null),
    getMany: jest.fn().mockResolvedValue(overrides.getMany ?? []),
  };
  return qb;
}

function buildModule(loanRepoOverrides: any = {}, reservationRepoOverrides: any = {}) {
  const defaultQb = makeQb();

  const loanRepo = {
    count: jest.fn().mockResolvedValue(0),
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((dto: any) => dto),
    save: jest.fn().mockImplementation((entity: any) => Promise.resolve(entity)),
    find: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue(undefined),
    ...loanRepoOverrides,
  };

  const reservationRepo = {
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
    createQueryBuilder: jest.fn(() => defaultQb),
    ...reservationRepoOverrides,
  };

  const itemsService = {
    findById: jest.fn().mockResolvedValue({ id: 'item-uuid' }),
  };

  const configService = {
    get: jest.fn((key: string, def?: any) => {
      const map: Record<string, any> = {
        'loans.maxLoanDays': 30,
        'loans.maxActivePerUser': 3,
        'loans.dailyFineRate': 0.5,
      };
      return map[key] ?? def;
    }),
  };

  return { loanRepo, reservationRepo, itemsService, configService, defaultQb };
}

// ─── base DTO ───────────────────────────────────────────────────────────────

const FUTURE_5_DAYS = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();

const baseDto: CreateLoanDto = {
  userId: 'user-uuid',
  itemId: 'item-uuid',
  dueAt: FUTURE_5_DAYS,
};

// ─── suite ──────────────────────────────────────────────────────────────────

describe('LoansService', () => {
  async function createService(
    loanRepoOverrides: any = {},
    reservationRepoOverrides: any = {},
  ): Promise<{ service: LoansService; mocks: ReturnType<typeof buildModule> }> {
    const mocks = buildModule(loanRepoOverrides, reservationRepoOverrides);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoansService,
        { provide: getRepositoryToken(Loan), useValue: mocks.loanRepo },
        { provide: getRepositoryToken(Reservation), useValue: mocks.reservationRepo },
        { provide: ItemsService, useValue: mocks.itemsService },
        { provide: ConfigService, useValue: mocks.configService },
      ],
    }).compile();

    return { service: module.get(LoansService), mocks };
  }

  // ── Test 1 ─────────────────────────────────────────────────────────────────
  it('crea préstamo exitoso cuando item disponible, usuario bajo el límite y fechas válidas', async () => {
    const { service, mocks } = await createService();

    const result = await service.create(baseDto);

    expect(mocks.loanRepo.save).toHaveBeenCalledTimes(1);
    expect(result.status).toBe(LoanStatus.ACTIVE);
    expect(result.fineAmount).toBe(0);
    expect(result.userId).toBe('user-uuid');
    expect(result.itemId).toBe('item-uuid');
  });

  // ── Test 2 ─────────────────────────────────────────────────────────────────
  it('R2 — lanza ConflictException si el item ya tiene un préstamo activo', async () => {
    const blockingLoan = { id: 'blocking-loan-id', status: LoanStatus.ACTIVE };

    const { service } = await createService({
      // count(active+overdue for user) = 0
      count: jest.fn().mockResolvedValue(0),
      // first findOne (blocking loan check) → blocking loan found
      findOne: jest.fn().mockResolvedValue(blockingLoan),
    });

    await expect(service.create(baseDto)).rejects.toThrow(ConflictException);
    await expect(service.create(baseDto)).rejects.toThrow('blocking-loan-id');
  });

  // ── Test 3 ─────────────────────────────────────────────────────────────────
  it('R3 — lanza ConflictException si el usuario ya tiene 3 préstamos activos o vencidos', async () => {
    const { service } = await createService({
      count: jest.fn().mockResolvedValue(3),
    });

    await expect(service.create(baseDto)).rejects.toThrow(ConflictException);
  });

  // ── Test 4 ─────────────────────────────────────────────────────────────────
  it('R4 — returnLoan calcula fineAmount = 2.50 para préstamo con 5 días de retraso', async () => {
    const frozenNow = new Date('2026-01-15T12:00:00.000Z');
    jest.useFakeTimers().setSystemTime(frozenNow);

    try {
      const dueAt = new Date('2026-01-10T12:00:00.000Z'); // 5 días exactos antes de frozenNow
      const loan = {
        id: 'loan-1',
        status: LoanStatus.OVERDUE, // ya vencido, syncOverdueSingle no actúa
        dueAt,
        returnedAt: null,
        fineAmount: 0,
        itemId: 'item-uuid',
      };

      const { service, mocks } = await createService({
        findOne: jest.fn().mockResolvedValue(loan),
        save: jest.fn().mockImplementation((l: any) => Promise.resolve({ ...l })),
        update: jest.fn().mockResolvedValue(undefined),
      });

      const result = await service.returnLoan('loan-1');

      expect(result.status).toBe(LoanStatus.RETURNED);
      expect(result.fineAmount).toBe(2.5); // 5 días × $0.50
      expect(mocks.loanRepo.save).toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  // ── Test 5 (bonus) ─────────────────────────────────────────────────────────
  it('R-B1.4 — lanza ForbiddenException si otro usuario intenta tomar un item con reservas pendientes', async () => {
    const queueHead = makeQb({ getOne: { id: 'res-1', userId: 'other-user' } });

    const { service } = await createService(
      {
        count: jest.fn().mockResolvedValue(0),
        findOne: jest.fn().mockResolvedValue(null), // no blocking loan
      },
      { createQueryBuilder: jest.fn(() => queueHead) },
    );

    await expect(service.create(baseDto)).rejects.toThrow(ForbiddenException);
  });

  // ── Test 6 (bonus) ─────────────────────────────────────────────────────────
  it('R-B1.4 — permite crear préstamo al primer usuario en cola y cancela su reserva', async () => {
    const queueHead = makeQb({ getOne: { id: 'res-1', userId: 'user-uuid' } });

    const { service, mocks } = await createService(
      {
        count: jest.fn().mockResolvedValue(0),
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn((dto: any) => ({ ...dto, status: LoanStatus.ACTIVE, fineAmount: 0 })),
        save: jest.fn().mockImplementation((l: any) => Promise.resolve(l)),
      },
      {
        createQueryBuilder: jest.fn(() => queueHead),
        update: jest.fn().mockResolvedValue(undefined),
      },
    );

    const result = await service.create(baseDto);

    expect(result.status).toBe(LoanStatus.ACTIVE);
    expect(mocks.reservationRepo.update).toHaveBeenCalledWith('res-1', expect.objectContaining({ cancelledAt: expect.any(Date) }));
  });
});
