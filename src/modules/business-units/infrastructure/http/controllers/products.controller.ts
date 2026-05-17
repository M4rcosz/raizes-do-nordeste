import { Controller, Get, Param, Query } from '@nestjs/common';
import { GetActiveProductsUseCase } from '../../../application/use-cases/get-active-products.use-case';
import { GetProductsByBusinessUnitUseCase } from '../../../application/use-cases/get-products-by-business-unit.use-case';
import { GetProductByIdUseCase } from '../../../application/use-cases/get-product-by-id.use-case';
import { ProductResponseDto } from '../dto/product-response.dto';
import { PaginatedResponseDto } from '@shared/pagination/paginated-response.dto';
import { sanitizeLimit } from '@shared/pagination/pagination';
import { ProductFilters } from '../../../domain/repositories/product.repository';
import { Public } from '@shared/auth/public.decorator';
import {
  BusinessUnitIdParamDto,
  ProductIdParamDto,
  ProductsQueryDto,
} from '../dto/product-query.dto';

@Controller('products')
export class ProductsController {
  constructor(
    private readonly getActiveProducts: GetActiveProductsUseCase,
    private readonly getProductsByBusinessUnit: GetProductsByBusinessUnitUseCase,
    private readonly getProductById: GetProductByIdUseCase,
  ) {}

  @Public()
  @Get()
  async findActive(
    @Query() query: ProductsQueryDto,
  ): Promise<PaginatedResponseDto<ProductResponseDto>> {
    const { limit: rawLimit, categoryId, search, cursor } = query;
    const limit = sanitizeLimit(rawLimit);
    const filters = this.buildFilters(search, categoryId);

    const result = await this.getActiveProducts.execute({ cursor, limit, filters });

    return new PaginatedResponseDto(
      result.data.map((product) => ProductResponseDto.fromEntity(product)),
      result.meta,
    );
  }

  @Public()
  @Get('by-business-unit/:businessUnitId')
  async findByBusinessUnit(
    @Param() { businessUnitId }: BusinessUnitIdParamDto,
    @Query() query: ProductsQueryDto,
  ): Promise<PaginatedResponseDto<ProductResponseDto>> {
    const { limit: rawLimit, categoryId, search, cursor } = query;
    const limit = sanitizeLimit(rawLimit);
    const filters = this.buildFilters(search, categoryId);

    const result = await this.getProductsByBusinessUnit.execute({
      businessUnitId,
      cursor,
      limit,
      filters,
    });

    return new PaginatedResponseDto(
      result.data.map((product) => ProductResponseDto.fromEntity(product)),
      result.meta,
    );
  }

  @Public()
  @Get(':productId')
  async findById(@Param() { productId }: ProductIdParamDto): Promise<ProductResponseDto> {
    const product = await this.getProductById.execute(productId);
    return ProductResponseDto.fromEntity(product);
  }

  private buildFilters(
    search: string | undefined,
    categoryId: string | undefined,
  ): ProductFilters | undefined {
    if (!search && !categoryId) {
      return undefined;
    }
    return { search: search?.trim() || undefined, categoryId };
  }
}
