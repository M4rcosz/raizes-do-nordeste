import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@modules/identity/domain/value-objects/user-role';
import { Roles } from '@shared/auth/roles.decorator';
import { PaginatedResponseDto } from '@shared/pagination/paginated-response.dto';
import { sanitizeLimit } from '@shared/pagination/pagination';
import { CreatePromotionUseCase } from '@modules/promotions/application/use-cases/create-promotion.use-case';
import { UpdatePromotionUseCase } from '@modules/promotions/application/use-cases/update-promotion.use-case';
import { FindPromotionByIdUseCase } from '@modules/promotions/application/use-cases/find-promotion-by-id.use-case';
import { ListPromotionsUseCase } from '@modules/promotions/application/use-cases/list-promotions.use-case';
import { CreatePromotionDto } from '../dto/create-promotion.dto';
import { UpdatePromotionDto } from '../dto/update-promotion.dto';
import { PromotionResponseDto } from '../dto/promotion-response.dto';
import { PaginatedPromotionResponseDto } from '../dto/paginated-promotion-response.dto';
import {
  PromotionBusinessUnitIdParamDto,
  PromotionIdParamDto,
  PromotionsQueryDto,
} from '../dto/promotion-query.dto';

@ApiTags('promotions')
@ApiBearerAuth()
@Controller('promotions')
export class PromotionsController {
  constructor(
    private readonly createPromotion: CreatePromotionUseCase,
    private readonly updatePromotion: UpdatePromotionUseCase,
    private readonly findPromotionById: FindPromotionByIdUseCase,
    private readonly listPromotions: ListPromotionsUseCase,
  ) {}

  @Roles([UserRole.ADMIN, UserRole.MANAGER])
  @Post()
  @ApiOperation({ summary: 'Create a promotion' })
  @ApiCreatedResponse({ type: PromotionResponseDto })
  @ApiNotFoundResponse({ description: 'The referenced business unit does not exist' })
  async create(@Body() dto: CreatePromotionDto): Promise<PromotionResponseDto> {
    // TODO(tenant-scope): businessUnitId comes from the admin's body today. When the
    // identity context exposes a businessUnitId JWT claim, scope writes to that claim
    // and stop trusting the body for the unit.
    const promotion = await this.createPromotion.execute(dto);
    return PromotionResponseDto.fromEntity(promotion);
  }

  @Roles([UserRole.ADMIN, UserRole.MANAGER])
  @Get('by-business-unit/:businessUnitId')
  @ApiOperation({ summary: 'List promotions for a business unit (cursor-paginated)' })
  @ApiOkResponse({ type: PaginatedPromotionResponseDto })
  async findByBusinessUnit(
    @Param() { businessUnitId }: PromotionBusinessUnitIdParamDto,
    @Query() query: PromotionsQueryDto,
  ): Promise<PaginatedResponseDto<PromotionResponseDto>> {
    // TODO(tenant-scope): the unit is a route param today (cross-tenant read is the
    // admin's choice). Pin it to the JWT claim once identity exposes one.
    const limit = sanitizeLimit(query.limit);
    const result = await this.listPromotions.execute({
      businessUnitId,
      cursor: query.cursor,
      limit,
    });
    return new PaginatedResponseDto(
      result.data.map((promotion) => PromotionResponseDto.fromEntity(promotion)),
      result.meta,
    );
  }

  @Roles([UserRole.ADMIN, UserRole.MANAGER])
  @Get(':promotionId')
  @ApiOperation({ summary: 'Get a promotion by ID' })
  @ApiOkResponse({ type: PromotionResponseDto })
  @ApiNotFoundResponse({ description: 'Promotion not found' })
  async findById(@Param() { promotionId }: PromotionIdParamDto): Promise<PromotionResponseDto> {
    const promotion = await this.findPromotionById.execute(promotionId);
    return PromotionResponseDto.fromEntity(promotion);
  }

  @Roles([UserRole.ADMIN, UserRole.MANAGER])
  @Patch(':promotionId')
  @ApiOperation({ summary: 'Update a promotion' })
  @ApiOkResponse({ type: PromotionResponseDto })
  @ApiNotFoundResponse({ description: 'Promotion not found' })
  async update(
    @Param() { promotionId }: PromotionIdParamDto,
    @Body() dto: UpdatePromotionDto,
  ): Promise<PromotionResponseDto> {
    const promotion = await this.updatePromotion.execute(promotionId, dto);
    return PromotionResponseDto.fromEntity(promotion);
  }
}
