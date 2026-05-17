import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID } from 'class-validator';

export class ProductsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  limit?: number;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsString()
  search?: string;
}

export class BusinessUnitIdParamDto {
  @IsUUID()
  businessUnitId!: string;
}

export class ProductIdParamDto {
  @IsUUID()
  productId!: string;
}
