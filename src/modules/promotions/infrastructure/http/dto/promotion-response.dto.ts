import { ApiProperty } from '@nestjs/swagger';
import { Promotion } from '@modules/promotions/domain/entities/promotion.entity';
import { DiscountType } from '@modules/promotions/domain/value-objects/discount-type';

export class PromotionResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000', format: 'uuid' })
  public readonly id: string;

  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6', format: 'uuid' })
  public readonly businessUnitId: string;

  @ApiProperty({ example: 'Almoço executivo' })
  public readonly name: string;

  @ApiProperty({ enum: DiscountType, example: DiscountType.PERCENTAGE })
  public readonly discountType: DiscountType;

  @ApiProperty({ example: '10.00', type: String, description: 'Decimal string, 2 places' })
  public readonly discountValue: string;

  @ApiProperty({ example: '30.00', type: String, description: 'Decimal string, 2 places' })
  public readonly minOrderValue: string;

  @ApiProperty({ example: '2026-06-01T00:00:00.000Z' })
  public readonly startDate: Date;

  @ApiProperty({ example: '2026-06-30T23:59:59.000Z' })
  public readonly endDate: Date;

  @ApiProperty({ example: true })
  public readonly isActive: boolean;

  @ApiProperty({ example: '2026-05-18T10:30:00.000Z' })
  public readonly createdAt: Date;

  @ApiProperty({ example: '2026-05-18T10:30:00.000Z' })
  public readonly updatedAt: Date;

  constructor(
    id: string,
    businessUnitId: string,
    name: string,
    discountType: DiscountType,
    discountValue: string,
    minOrderValue: string,
    startDate: Date,
    endDate: Date,
    isActive: boolean,
    createdAt: Date,
    updatedAt: Date,
  ) {
    this.id = id;
    this.businessUnitId = businessUnitId;
    this.name = name;
    this.discountType = discountType;
    this.discountValue = discountValue;
    this.minOrderValue = minOrderValue;
    this.startDate = startDate;
    this.endDate = endDate;
    this.isActive = isActive;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  static fromEntity(promotion: Promotion): PromotionResponseDto {
    return new PromotionResponseDto(
      promotion.id,
      promotion.businessUnitId,
      promotion.name,
      promotion.discountType,
      promotion.discountValue.toDecimalString(),
      promotion.minOrderValue.toDecimalString(),
      promotion.startDate,
      promotion.endDate,
      promotion.isActive,
      promotion.createdAt,
      promotion.updatedAt,
    );
  }
}
