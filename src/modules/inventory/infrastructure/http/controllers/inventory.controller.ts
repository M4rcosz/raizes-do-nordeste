import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Roles } from '@shared/auth/roles.decorator';
import { CurrentUser } from '@shared/auth/current-user.decorator';
import type { JwtPayload } from '@shared/auth/jwt-payload.type';
import { UserRole } from '@modules/identity/domain/value-objects/user-role';
import { GetInventoryUseCase } from '@modules/inventory/application/use-cases/get-inventory.use-case';
import { AdjustInventoryUseCase } from '@modules/inventory/application/use-cases/adjust-inventory.use-case';
import { InventoryUnitParamDto } from '../dto/inventory-params.dto';
import { AdjustInventoryDto } from '../dto/adjust-inventory.dto';
import { InventoryResponseDto } from '../dto/inventory-response.dto';

/** Stock is a management concern: ATTENDANT/KITCHEN/CUSTOMER never touch it. */
const INVENTORY_ROLES: UserRole[] = [UserRole.MANAGER, UserRole.ADMIN];

@ApiTags('inventory')
@ApiBearerAuth()
@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly getInventory: GetInventoryUseCase,
    private readonly adjustInventory: AdjustInventoryUseCase,
  ) {}

  @Get(':businessUnitId')
  @Roles(INVENTORY_ROLES)
  @ApiOperation({ summary: 'List the stock balances of a business unit. Managers only.' })
  @ApiOkResponse({ type: [InventoryResponseDto] })
  async list(@Param() { businessUnitId }: InventoryUnitParamDto): Promise<InventoryResponseDto[]> {
    // TODO(pagination): plain list for now - per-unit inventory volume is bounded
    // by the menu size. Revisit with cursor pagination if units grow past that.
    const inventories = await this.getInventory.execute(businessUnitId);
    return inventories.map((inventory) => InventoryResponseDto.fromEntity(inventory));
  }

  @Post(':businessUnitId/adjust')
  @Roles(INVENTORY_ROLES)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Apply a manual IN/OUT stock movement. Managers only.' })
  @ApiCreatedResponse({ type: InventoryResponseDto })
  @ApiNotFoundResponse({ description: 'Product has no inventory row at this unit (IN).' })
  @ApiUnprocessableEntityResponse({ description: 'OUT would drive the balance below zero.' })
  async adjust(
    @Param() { businessUnitId }: InventoryUnitParamDto,
    @Body() body: AdjustInventoryDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<InventoryResponseDto> {
    const inventory = await this.adjustInventory.execute({ businessUnitId, ...body }, user.sub);
    return InventoryResponseDto.fromEntity(inventory);
  }
}
