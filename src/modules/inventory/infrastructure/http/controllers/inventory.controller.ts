import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Roles } from '@shared/auth/roles.decorator';
import { UnitScopeGuard } from '@shared/auth/unit-scope.guard';
import { ScopedToBusinessUnit } from '@shared/auth/scoped-to-business-unit.decorator';
import { CurrentUser } from '@shared/auth/current-user.decorator';
import type { JwtPayload } from '@shared/auth/jwt-payload.type';
import { UserRole } from '@modules/identity/domain/value-objects/user-role';
import { PaginatedResponseDto } from '@shared/pagination/paginated-response.dto';
import { sanitizeLimit } from '@shared/pagination/pagination';
import { GetInventoryUseCase } from '@modules/inventory/application/use-cases/get-inventory.use-case';
import { AdjustInventoryUseCase } from '@modules/inventory/application/use-cases/adjust-inventory.use-case';
import { InitializeInventoryItemUseCase } from '@modules/inventory/application/use-cases/initialize-inventory-item.use-case';
import { InventoryUnitParamDto } from '../dto/inventory-params.dto';
import { AdjustInventoryDto } from '../dto/adjust-inventory.dto';
import { InitializeInventoryItemDto } from '../dto/initialize-inventory-item.dto';
import { InventoryResponseDto } from '../dto/inventory-response.dto';
import { InventoryQueryDto } from '../dto/inventory-query.dto';
import { PaginatedInventoryResponseDto } from '../dto/paginated-inventory-response.dto';

/** Stock is a management concern: ATTENDANT/KITCHEN/CUSTOMER never touch it. */
const INVENTORY_ROLES: UserRole[] = [UserRole.MANAGER, UserRole.ADMIN];

@ApiTags('inventory')
@ApiBearerAuth()
@Controller('inventory')
// Both routes carry the unit in the :businessUnitId param. The guard rejects a
// non-admin staff whose claim does not match it (reported as not-found).
@UseGuards(UnitScopeGuard)
@ScopedToBusinessUnit('businessUnitId')
export class InventoryController {
  constructor(
    private readonly getInventory: GetInventoryUseCase,
    private readonly adjustInventory: AdjustInventoryUseCase,
    private readonly initializeInventoryItem: InitializeInventoryItemUseCase,
  ) {}

  @Get(':businessUnitId')
  @Roles(INVENTORY_ROLES)
  @ApiOperation({
    summary: 'List the stock balances of a business unit (cursor-paginated). Managers only.',
  })
  @ApiOkResponse({ type: PaginatedInventoryResponseDto })
  async list(
    @Param() { businessUnitId }: InventoryUnitParamDto,
    @Query() query: InventoryQueryDto,
  ): Promise<PaginatedResponseDto<InventoryResponseDto>> {
    const limit = sanitizeLimit(query.limit);
    const result = await this.getInventory.execute({ businessUnitId, cursor: query.cursor, limit });
    return new PaginatedResponseDto(
      result.data.map((inventory) => InventoryResponseDto.fromEntity(inventory)),
      result.meta,
    );
  }

  @Post(':businessUnitId/items')
  @Roles(INVENTORY_ROLES)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Initialize the first stock row for a product at a unit. Managers only.',
  })
  @ApiCreatedResponse({ type: InventoryResponseDto })
  @ApiConflictResponse({ description: 'Product already has an inventory row at this unit.' })
  @ApiNotFoundResponse({ description: 'Product or business unit does not exist.' })
  async initialize(
    @Param() { businessUnitId }: InventoryUnitParamDto,
    @Body() body: InitializeInventoryItemDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<InventoryResponseDto> {
    // Param last: it is the value UnitScopeGuard authorized against the JWT claim,
    // so it must win even if the DTO ever grows a businessUnitId field.
    const inventory = await this.initializeInventoryItem.execute(
      { ...body, businessUnitId },
      user.sub,
    );
    return InventoryResponseDto.fromEntity(inventory);
  }

  @Post(':businessUnitId/adjust')
  @Roles(INVENTORY_ROLES)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Apply a manual IN/OUT stock movement. Managers only.' })
  @ApiCreatedResponse({ type: InventoryResponseDto })
  @ApiNotFoundResponse({ description: 'Product has no inventory row at this unit (IN).' })
  @ApiUnprocessableEntityResponse({
    description: 'OUT would drive the balance below zero, or IN would exceed the maximum stock.',
  })
  async adjust(
    @Param() { businessUnitId }: InventoryUnitParamDto,
    @Body() body: AdjustInventoryDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<InventoryResponseDto> {
    // Param last, same reason as initialize().
    const inventory = await this.adjustInventory.execute({ ...body, businessUnitId }, user.sub);
    return InventoryResponseDto.fromEntity(inventory);
  }
}
