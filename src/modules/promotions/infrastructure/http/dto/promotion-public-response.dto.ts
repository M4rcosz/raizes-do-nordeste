import { ApiProperty } from '@nestjs/swagger';
import { Promotion } from '@modules/promotions/domain/entities/promotion.entity';
import { DiscountType } from '@modules/promotions/domain/value-objects/discount-type';

/**
 * Customer-facing view of a promotion. Carries what a customer needs to understand the
 * offer and when it ends; omits isActive and the timestamps (back-office signals, and
 * isActive is always true here by construction).
 */
export class PublicPromotionResponseDto {
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

  @ApiProperty({
    example: '2026-06-30T23:59:59.000Z',
    description: 'First instant the promotion is no longer valid',
  })
  public readonly endDate: Date;

  constructor(
    id: string,
    businessUnitId: string,
    name: string,
    discountType: DiscountType,
    discountValue: string,
    minOrderValue: string,
    endDate: Date,
  ) {
    this.id = id;
    this.businessUnitId = businessUnitId;
    this.name = name;
    this.discountType = discountType;
    this.discountValue = discountValue;
    this.minOrderValue = minOrderValue;
    this.endDate = endDate;
  }

  static fromEntity(promotion: Promotion): PublicPromotionResponseDto {
    return new PublicPromotionResponseDto(
      promotion.id,
      promotion.businessUnitId,
      promotion.name,
      promotion.discountType,
      promotion.discountValue.toDecimalString(),
      promotion.minOrderValue.toDecimalString(),
      promotion.endDate,
    );
  }
}
