import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
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
import { CurrentUser } from '@shared/auth/current-user.decorator';
import type { JwtPayload } from '@shared/auth/jwt-payload.type';
import { UnitScopeGuard } from '@shared/auth/unit-scope.guard';
import { ScopedToBusinessUnit } from '@shared/auth/scoped-to-business-unit.decorator';
import { PaginatedResponseDto } from '@shared/pagination/paginated-response.dto';
import type { PromotionActor } from '@modules/promotions/application/promotion-actor';
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
// Every route is unit-scoped management. The guard rejects a non-admin staff
// acting outside their claim (reported as not-found). Routes that carry the unit
// in a :businessUnitId param name it; the rest derive/check the unit from the claim.
@UseGuards(UnitScopeGuard)
export class PromotionsController {
  constructor(
    private readonly createPromotion: CreatePromotionUseCase,
    private readonly updatePromotion: UpdatePromotionUseCase,
    private readonly findPromotionById: FindPromotionByIdUseCase,
    private readonly listPromotions: ListPromotionsUseCase,
  ) {}

  // Reads the unit-scoping principal off the verified JWT claim.
  private actorOf(user: JwtPayload): PromotionActor {
    return { role: user.role, businessUnitIds: user.businessUnitIds };
  }

  @Roles([UserRole.ADMIN, UserRole.MANAGER])
  @ScopedToBusinessUnit()
  @Post()
  @ApiOperation({ summary: 'Create a promotion' })
  @ApiCreatedResponse({ type: PromotionResponseDto })
  @ApiNotFoundResponse({ description: 'The target unit is outside the actor scope' })
  async create(
    @Body() dto: CreatePromotionDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<PromotionResponseDto> {
    // The target unit is in the body; the use case rejects units outside scope.
    const promotion = await this.createPromotion.execute(dto, this.actorOf(user));
    return PromotionResponseDto.fromEntity(promotion);
  }

  @Roles([UserRole.ADMIN, UserRole.MANAGER])
  @ScopedToBusinessUnit('businessUnitId')
  @Get('by-business-unit/:businessUnitId')
  @ApiOperation({ summary: 'List promotions for a business unit (cursor-paginated)' })
  @ApiOkResponse({ type: PaginatedPromotionResponseDto })
  async findByBusinessUnit(
    @Param() { businessUnitId }: PromotionBusinessUnitIdParamDto,
    @Query() query: PromotionsQueryDto,
  ): Promise<PaginatedResponseDto<PromotionResponseDto>> {
    // The guard already pinned the param to the actor's claim (admin bypassed).
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
  @ScopedToBusinessUnit()
  @Get(':promotionId')
  @ApiOperation({ summary: 'Get a promotion by ID' })
  @ApiOkResponse({ type: PromotionResponseDto })
  @ApiNotFoundResponse({ description: 'Promotion not found' })
  async findById(
    @Param() { promotionId }: PromotionIdParamDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<PromotionResponseDto> {
    // No unit in the path, so ownership is checked in the use case against the claim.
    const promotion = await this.findPromotionById.execute(promotionId, this.actorOf(user));
    return PromotionResponseDto.fromEntity(promotion);
  }

  @Roles([UserRole.ADMIN, UserRole.MANAGER])
  @ScopedToBusinessUnit()
  @Patch(':promotionId')
  @ApiOperation({ summary: 'Update a promotion' })
  @ApiOkResponse({ type: PromotionResponseDto })
  @ApiNotFoundResponse({ description: 'Promotion not found' })
  async update(
    @Param() { promotionId }: PromotionIdParamDto,
    @Body() dto: UpdatePromotionDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<PromotionResponseDto> {
    // No unit in the path, so ownership is checked in the use case against the claim.
    const promotion = await this.updatePromotion.execute(promotionId, dto, this.actorOf(user));
    return PromotionResponseDto.fromEntity(promotion);
  }
}
