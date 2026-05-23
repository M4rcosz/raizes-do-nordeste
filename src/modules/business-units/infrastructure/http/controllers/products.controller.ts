import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { PaginatedProductResponseDto } from '../dto/paginated-product-response.dto';
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
import { ProductCreateDto } from '../dto/product-create.dto';
import { CreateProductUseCase } from '@modules/business-units/application/use-cases/create-product.use-case';
import { Roles } from '@shared/auth/roles.decorator';

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(
    private readonly getActiveProducts: GetActiveProductsUseCase,
    private readonly getProductsByBusinessUnit: GetProductsByBusinessUnitUseCase,
    private readonly getProductById: GetProductByIdUseCase,
    private readonly createProduct: CreateProductUseCase,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List active products (cursor-paginated)' })
  @ApiOkResponse({ type: PaginatedProductResponseDto })
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
  @ApiOperation({ summary: 'List active products for a business unit' })
  @ApiOkResponse({ type: PaginatedProductResponseDto })
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
  @ApiOperation({ summary: 'Get a product by ID' })
  @ApiOkResponse({ type: ProductResponseDto })
  @ApiNotFoundResponse({
    description: 'Product not found',
    schema: {
      example: {
        statusCode: 404,
        error: 'Not Found',
        message: 'Product not found',
        path: '/api/products/550e8400-e29b-41d4-a716-446655440000',
        timestamp: '2026-05-18T10:30:00.000Z',
      },
    },
  })
  async findById(@Param() { productId }: ProductIdParamDto): Promise<ProductResponseDto> {
    const product = await this.getProductById.execute(productId);
    return ProductResponseDto.fromEntity(product);
  }

  @Roles(['ADMIN', 'MANAGER'])
  @Post()
  @ApiOperation({ summary: 'Create a new product' })
  @ApiCreatedResponse({ type: ProductResponseDto })
  @ApiConflictResponse({ description: 'A product with the same name already exists' })
  @ApiNotFoundResponse({ description: 'The referenced category does not exist' })
  async create(@Body() productCreateDto: ProductCreateDto): Promise<ProductResponseDto> {
    const product = await this.createProduct.execute(productCreateDto);
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
