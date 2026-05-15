import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, MoreThan, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';
import { Item } from '../items/entities/item.entity';
import { Loan, LoanStatus } from '../loans/entities/loan.entity';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { Reservation } from './entities/reservation.entity';

@Injectable()
export class ReservationsService {
  constructor(
    @InjectRepository(Reservation)
    private readonly reservationRepo: Repository<Reservation>,
    @InjectRepository(Loan)
    private readonly loanRepo: Repository<Loan>,
    @InjectRepository(Item)
    private readonly itemRepo: Repository<Item>,
  ) {}

  async create(userId: string, dto: CreateReservationDto): Promise<Reservation> {
    const item = await this.itemRepo.findOne({ where: { id: dto.itemId, isActive: true } });
    if (!item) throw new NotFoundException('Item no encontrado');

    const activeLoan = await this.loanRepo.findOne({
      where: { itemId: dto.itemId, status: In([LoanStatus.ACTIVE, LoanStatus.OVERDUE]) },
    });
    if (!activeLoan) {
      throw new BadRequestException('Solo puedes reservar un item que ya está prestado');
    }

    // R-B1.1: user cannot have more than 1 active reservation for the same item
    const now = new Date();
    const existing = await this.reservationRepo.findOne({
      where: [
        {
          userId,
          itemId: dto.itemId,
          cancelledAt: IsNull(),
          expiresAt: IsNull(),
          fulfilledAt: IsNull(),
        },
        { userId, itemId: dto.itemId, cancelledAt: IsNull(), expiresAt: MoreThan(now) },
      ],
    });
    if (existing) throw new ConflictException('Ya tienes una reserva activa para este item');

    const reservation = this.reservationRepo.create({
      userId,
      itemId: dto.itemId,
      fulfilledAt: null,
      cancelledAt: null,
      expiresAt: null,
    });
    return this.reservationRepo.save(reservation);
  }

  async findAll(currentUser: AuthenticatedUser, itemId?: string): Promise<Reservation[]> {
    const qb = this.reservationRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.user', 'user')
      .leftJoinAndSelect('r.item', 'item')
      .orderBy('r.createdAt', 'ASC');

    if (currentUser.role === UserRole.MEMBER) {
      qb.where('r.userId = :userId', { userId: currentUser.id });
    }
    if (itemId) {
      qb.andWhere('r.itemId = :itemId', { itemId });
    }

    return qb.getMany();
  }

  async cancel(id: string, userId: string, userRole: UserRole): Promise<void> {
    const reservation = await this.reservationRepo.findOne({ where: { id } });
    if (!reservation) throw new NotFoundException('Reserva no encontrada');

    if (userRole === UserRole.MEMBER && reservation.userId !== userId) {
      throw new ForbiddenException('No puedes cancelar una reserva que no es tuya');
    }
    if (reservation.cancelledAt) throw new BadRequestException('La reserva ya está cancelada');

    reservation.cancelledAt = new Date();
    await this.reservationRepo.save(reservation);
  }
}
