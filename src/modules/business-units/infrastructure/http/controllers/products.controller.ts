import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnprocessableEntityResponse,
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
import { ProductUpdateDto } from '../dto/product-update.dto';
import { ConfirmProductImageDto } from '../dto/confirm-product-image.dto';
import { ProductImageUploadUrlRequestDto } from '../dto/product-image-upload-url-request.dto';
import { ProductImageUploadUrlResponseDto } from '../dto/product-image-upload-url-response.dto';
import { CreateProductUseCase } from '@modules/business-units/application/use-cases/create-product.use-case';
import { SetProductActiveUseCase } from '@modules/business-units/application/use-cases/set-product-active.use-case';
import { UpdateProductUseCase } from '@modules/business-units/application/use-cases/update-product.use-case';
import { CreateProductImageUploadUrlUseCase } from '@modules/business-units/application/use-cases/create-product-image-upload-url.use-case';
import { ConfirmProductImageUploadUseCase } from '@modules/business-units/application/use-cases/confirm-product-image-upload.use-case';
import { Roles } from '@shared/auth/roles.decorator';
import { CurrentUser } from '@shared/auth/current-user.decorator';
import type { JwtPayload } from '@shared/auth/jwt-payload.type';

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(
    private readonly getActiveProducts: GetActiveProductsUseCase,
    private readonly getProductsByBusinessUnit: GetProductsByBusinessUnitUseCase,
    private readonly getProductById: GetProductByIdUseCase,
    private readonly createProduct: CreateProductUseCase,
    private readonly setProductActive: SetProductActiveUseCase,
    private readonly updateProduct: UpdateProductUseCase,
    private readonly createProductImageUploadUrl: CreateProductImageUploadUrlUseCase,
    private readonly confirmProductImageUpload: ConfirmProductImageUploadUseCase,
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

  @Roles(['ADMIN'])
  @Patch(':productId')
  @ApiOperation({ summary: 'Update a product (partial edit of catalog fields)' })
  @ApiOkResponse({ type: ProductResponseDto })
  @ApiNotFoundResponse({
    description: 'Product not found or the referenced category does not exist',
  })
  @ApiConflictResponse({ description: 'A product with the same name already exists' })
  async update(
    @CurrentUser() actor: JwtPayload,
    @Param() { productId }: ProductIdParamDto,
    @Body() productUpdateDto: ProductUpdateDto,
  ): Promise<ProductResponseDto> {
    const product = await this.updateProduct.execute(productId, productUpdateDto, actor.sub);
    return ProductResponseDto.fromEntity(product);
  }

  @Roles(['ADMIN'])
  @Patch(':productId/activate')
  @ApiOperation({ summary: 'Activate a product (set isActive to true)' })
  @ApiOkResponse({ type: ProductResponseDto })
  @ApiNotFoundResponse({ description: 'Product not found' })
  async activate(
    @CurrentUser() actor: JwtPayload,
    @Param() { productId }: ProductIdParamDto,
  ): Promise<ProductResponseDto> {
    const product = await this.setProductActive.execute(productId, true, actor.sub);
    return ProductResponseDto.fromEntity(product);
  }

  @Roles(['ADMIN'])
  @Patch(':productId/deactivate')
  @ApiOperation({ summary: 'Deactivate a product (set isActive to false)' })
  @ApiOkResponse({ type: ProductResponseDto })
  @ApiNotFoundResponse({ description: 'Product not found' })
  async deactivate(
    @CurrentUser() actor: JwtPayload,
    @Param() { productId }: ProductIdParamDto,
  ): Promise<ProductResponseDto> {
    const product = await this.setProductActive.execute(productId, false, actor.sub);
    return ProductResponseDto.fromEntity(product);
  }

  // Every mint hands out a credential that can write into the bucket for two
  // hours, so this is throttled harder than the read routes.
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @Roles(['ADMIN', 'MANAGER'])
  @Post(':productId/image/upload-url')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Mint a signed URL to upload a product image directly to storage',
    description:
      'Step 1 of 2. Upload the file to the returned signedUrl, then call the confirm ' +
      'endpoint with the returned path. Nothing is persisted here.',
  })
  @ApiCreatedResponse({ type: ProductImageUploadUrlResponseDto })
  @ApiNotFoundResponse({ description: 'Product not found' })
  @ApiServiceUnavailableResponse({ description: 'Image storage is unavailable' })
  async createImageUploadUrl(
    @Param() { productId }: ProductIdParamDto,
    @Body() body: ProductImageUploadUrlRequestDto,
  ): Promise<ProductImageUploadUrlResponseDto> {
    const upload = await this.createProductImageUploadUrl.execute({
      productId,
      contentType: body.contentType,
    });
    return ProductImageUploadUrlResponseDto.fromSignedUpload(upload);
  }

  @Roles(['ADMIN', 'MANAGER'])
  @Post(':productId/image/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirm an uploaded product image and publish its URL',
    description:
      'Step 2 of 2. Verifies the object really exists and passes the size/type policy, ' +
      'then stores its public URL and deletes the image it replaced.',
  })
  @ApiOkResponse({ type: ProductResponseDto })
  @ApiNotFoundResponse({ description: 'Product not found, or no object was uploaded at that path' })
  @ApiUnprocessableEntityResponse({
    description: 'The path does not belong to this product, or the object fails the image policy',
  })
  @ApiServiceUnavailableResponse({ description: 'Image storage is unavailable' })
  async confirmImage(
    @CurrentUser() actor: JwtPayload,
    @Param() { productId }: ProductIdParamDto,
    @Body() body: ConfirmProductImageDto,
  ): Promise<ProductResponseDto> {
    const product = await this.confirmProductImageUpload.execute({
      productId,
      path: body.path,
      actorId: actor.sub,
    });
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
