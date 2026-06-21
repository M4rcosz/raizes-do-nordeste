import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { DiscountType } from '@modules/promotions/domain/value-objects/discount-type';

// Mirrors CreatePromotionDto's bounds; businessUnitId is immutable so it is not patchable.
const POSITIVE_DECIMAL_2DP = /^(?!0+(?:\.0+)?$)\d{1,8}(?:\.\d{1,2})?$/;
const NON_NEGATIVE_DECIMAL_2DP = /^\d{1,8}(?:\.\d{1,2})?$/;

export class UpdatePromotionDto {
  @ApiPropertyOptional({ example: 'Almoço executivo', maxLength: 100 })
  @IsOptional()
  @MaxLength(100)
  @IsString()
  name?: string;

  @ApiPropertyOptional({ enum: DiscountType })
  @IsOptional()
  @IsEnum(DiscountType)
  discountType?: DiscountType;

  @ApiPropertyOptional({ example: '10.00' })
  @IsOptional()
  @Matches(POSITIVE_DECIMAL_2DP, {
    message: 'discountValue must be a positive decimal string with up to 2 decimal places',
  })
  discountValue?: string;

  @ApiPropertyOptional({ example: '30.00' })
  @IsOptional()
  @Matches(NON_NEGATIVE_DECIMAL_2DP, {
    message: 'minOrderValue must be a non-negative decimal string with up to 2 decimal places',
  })
  minOrderValue?: string;

  @ApiPropertyOptional({ example: '2026-06-01T00:00:00.000Z', type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startDate?: Date;

  @ApiPropertyOptional({ example: '2026-06-30T23:59:59.000Z', type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
