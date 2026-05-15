import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ItemType } from '../entities/item.entity';

export class CreateItemDto {
  @ApiProperty({ example: 'BK-0042' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(32)
  code: string;

  @ApiProperty({ example: 'Clean Code' })
  @IsNotEmpty()
  @IsString()
  title: string;

  @ApiProperty({ enum: ItemType, example: ItemType.BOOK })
  @IsEnum(ItemType)
  type: ItemType;
}
