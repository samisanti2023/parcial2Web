import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Loan, LoanStatus } from '../loans/entities/loan.entity';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { Item, ItemType } from './entities/item.entity';

export interface ItemWithAvailability extends Item {
  isAvailable: boolean;
}

@Injectable()
export class ItemsService {
  constructor(
    @InjectRepository(Item)
    private readonly itemRepo: Repository<Item>,
    @InjectRepository(Loan)
    private readonly loanRepo: Repository<Loan>,
  ) {}

  async create(dto: CreateItemDto): Promise<Item> {
    const existing = await this.itemRepo.findOne({ where: { code: dto.code } });
    if (existing) throw new ConflictException('Ya existe un item con ese código');
    return this.itemRepo.save(this.itemRepo.create(dto));
  }

  async findAll(type?: ItemType): Promise<ItemWithAvailability[]> {
    const where: { isActive: boolean; type?: ItemType } = { isActive: true };
    if (type) where.type = type;

    const items = await this.itemRepo.find({ where, order: { createdAt: 'DESC' } });
    return this.attachAvailability(items);
  }

  async findById(id: string): Promise<ItemWithAvailability> {
    const item = await this.itemRepo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Item no encontrado');
    const [withAvailability] = await this.attachAvailability([item]);
    return withAvailability;
  }

  async update(id: string, dto: UpdateItemDto): Promise<Item> {
    const item = await this.itemRepo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Item no encontrado');
    if (dto.code && dto.code !== item.code) {
      const existing = await this.itemRepo.findOne({ where: { code: dto.code } });
      if (existing) throw new ConflictException('Ya existe un item con ese código');
    }
    Object.assign(item, dto);
    return this.itemRepo.save(item);
  }

  async remove(id: string): Promise<void> {
    const item = await this.itemRepo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Item no encontrado');
    await this.itemRepo.update(id, { isActive: false });
  }

  private async attachAvailability(items: Item[]): Promise<ItemWithAvailability[]> {
    if (items.length === 0) return [];

    const activeLoans = await this.loanRepo.find({
      where: { status: LoanStatus.ACTIVE },
      select: ['itemId'],
    });
    const loanedItemIds = new Set(activeLoans.map((l) => l.itemId));

    return items.map((item) => ({ ...item, isAvailable: !loanedItemIds.has(item.id) }));
  }
}
