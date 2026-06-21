import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { DiscountType } from '@modules/promotions/domain/value-objects/discount-type';

// Positive 2dp decimal: rejects zero, max 8 integer + 2 fractional digits (DB Decimal(10,2)).
const POSITIVE_DECIMAL_2DP = /^(?!0+(?:\.0+)?$)\d{1,8}(?:\.\d{1,2})?$/;
// Non-negative 2dp decimal: allows zero (a "no minimum" order value), same width.
const NON_NEGATIVE_DECIMAL_2DP = /^\d{1,8}(?:\.\d{1,2})?$/;

export class CreatePromotionDto {
  @ApiProperty({ format: 'uuid', description: 'Business unit this promotion belongs to.' })
  @IsUUID()
  businessUnitId!: string;

  @ApiProperty({ example: 'Almoço executivo', maxLength: 100 })
  @MaxLength(100)
  @IsString()
  name!: string;

  @ApiProperty({ enum: DiscountType, example: DiscountType.PERCENTAGE })
  @IsEnum(DiscountType)
  discountType!: DiscountType;

  @ApiProperty({
    example: '10.00',
    description:
      'For PERCENTAGE: the percent as a decimal (10.00 = 10%). For FIXED_AMOUNT: the BRL amount. Positive, up to 2 decimals.',
  })
  @Matches(POSITIVE_DECIMAL_2DP, {
    message: 'discountValue must be a positive decimal string with up to 2 decimal places',
  })
  discountValue!: string;

  @ApiProperty({
    example: '30.00',
    description:
      'Minimum order subtotal for the promotion to apply. Use 0 for no minimum. Up to 2 decimals.',
  })
  @Matches(NON_NEGATIVE_DECIMAL_2DP, {
    message: 'minOrderValue must be a non-negative decimal string with up to 2 decimal places',
  })
  minOrderValue!: string;

  @ApiProperty({ example: '2026-06-01T00:00:00.000Z', type: String, format: 'date-time' })
  @Type(() => Date)
  @IsDate()
  startDate!: Date;

  @ApiProperty({ example: '2026-06-30T23:59:59.000Z', type: String, format: 'date-time' })
  @Type(() => Date)
  @IsDate()
  endDate!: Date;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
