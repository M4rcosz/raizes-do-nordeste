import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { PaginatedCategoryResponseDto } from '../dto/paginated-category-response.dto';
import { CategoryResponseDto } from '../dto/category-response.dto';
import { PaginatedResponseDto } from '@shared/pagination/paginated-response.dto';
import { sanitizeLimit } from '@shared/pagination/pagination';
import { CategoryFilters } from '../../../domain/repositories/category.repository';
import { Public } from '@shared/auth/public.decorator';
import { CategoriesQueryDto, CategoryIdParamDto } from '../dto/category-query.dto';
import { CategoryCreateDto } from '../dto/category-create.dto';
import { CategoryUpdateDto } from '../dto/category-update.dto';
import { ListCategoriesUseCase } from '@modules/business-units/application/use-cases/list-categories.use-case';
import { GetCategoryByIdUseCase } from '@modules/business-units/application/use-cases/get-category-by-id.use-case';
import { CreateCategoryUseCase } from '@modules/business-units/application/use-cases/create-category.use-case';
import { UpdateCategoryUseCase } from '@modules/business-units/application/use-cases/update-category.use-case';
import { Roles } from '@shared/auth/roles.decorator';
import { CurrentUser } from '@shared/auth/current-user.decorator';
import type { JwtPayload } from '@shared/auth/jwt-payload.type';

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(
    private readonly listCategories: ListCategoriesUseCase,
    private readonly getCategoryById: GetCategoryByIdUseCase,
    private readonly createCategory: CreateCategoryUseCase,
    private readonly updateCategory: UpdateCategoryUseCase,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List active categories (cursor-paginated)' })
  @ApiOkResponse({ type: PaginatedCategoryResponseDto })
  async findActive(
    @Query() query: CategoriesQueryDto,
  ): Promise<PaginatedResponseDto<CategoryResponseDto>> {
    const { limit: rawLimit, search, cursor } = query;
    const limit = sanitizeLimit(rawLimit);
    const filters = this.buildFilters(search);

    const result = await this.listCategories.execute({ cursor, limit, filters });

    return new PaginatedResponseDto(
      result.data.map((category) => CategoryResponseDto.fromEntity(category)),
      result.meta,
    );
  }

  @Public()
  @Get(':categoryId')
  @ApiOperation({ summary: 'Get a category by ID' })
  @ApiOkResponse({ type: CategoryResponseDto })
  @ApiNotFoundResponse({ description: 'Category not found' })
  async findById(@Param() { categoryId }: CategoryIdParamDto): Promise<CategoryResponseDto> {
    const category = await this.getCategoryById.execute(categoryId);
    return CategoryResponseDto.fromEntity(category);
  }

  @Roles(['ADMIN'])
  @Post()
  @ApiOperation({ summary: 'Create a new category' })
  @ApiCreatedResponse({ type: CategoryResponseDto })
  @ApiConflictResponse({ description: 'A category with the same name already exists' })
  async create(
    @CurrentUser() actor: JwtPayload,
    @Body() categoryCreateDto: CategoryCreateDto,
  ): Promise<CategoryResponseDto> {
    const category = await this.createCategory.execute(categoryCreateDto, actor.sub);
    return CategoryResponseDto.fromEntity(category);
  }

  @Roles(['ADMIN'])
  @Patch(':categoryId')
  @ApiOperation({ summary: 'Update a category (partial edit, toggles isActive)' })
  @ApiOkResponse({ type: CategoryResponseDto })
  @ApiNotFoundResponse({ description: 'Category not found' })
  @ApiConflictResponse({ description: 'A category with the same name already exists' })
  async update(
    @CurrentUser() actor: JwtPayload,
    @Param() { categoryId }: CategoryIdParamDto,
    @Body() categoryUpdateDto: CategoryUpdateDto,
  ): Promise<CategoryResponseDto> {
    const category = await this.updateCategory.execute(categoryId, categoryUpdateDto, actor.sub);
    return CategoryResponseDto.fromEntity(category);
  }

  private buildFilters(search: string | undefined): CategoryFilters | undefined {
    if (!search) {
      return undefined;
    }
    return { search: search.trim() || undefined };
  }
}
