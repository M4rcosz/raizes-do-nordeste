import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@modules/identity/domain/value-objects/user-role';
import { CurrentUser } from '@shared/auth/current-user.decorator';
import type { JwtPayload } from '@shared/auth/jwt-payload.type';
import { Public } from '@shared/auth/public.decorator';
import { Roles } from '@shared/auth/roles.decorator';
import { UnitScopeGuard } from '@shared/auth/unit-scope.guard';
import { ScopedToBusinessUnit } from '@shared/auth/scoped-to-business-unit.decorator';
import { PaginatedResponseDto } from '@shared/pagination/paginated-response.dto';
import { sanitizeLimit } from '@shared/pagination/pagination';
import { GetMenuByBusinessUnitUseCase } from '../../../application/use-cases/get-menu-by-business-unit.use-case';
import { GetMenuItemByIdUseCase } from '../../../application/use-cases/get-menu-item-by-id.use-case';
import { AddMenuItemUseCase } from '../../../application/use-cases/add-menu-item.use-case';
import { UpdateMenuItemUseCase } from '../../../application/use-cases/update-menu-item.use-case';
import { DeactivateMenuItemUseCase } from '../../../application/use-cases/deactivate-menu-item.use-case';
import { ActivateMenuItemUseCase } from '../../../application/use-cases/activate-menu-item.use-case';
import { BusinessUnitIdParamDto } from '../dto/product-query.dto';
import { MenuItemParamsDto, MenuItemsQueryDto } from '../dto/menu-item-query.dto';
import { MenuItemCreateDto } from '../dto/menu-item-create.dto';
import { MenuItemUpdateDto } from '../dto/menu-item-update.dto';
import { MenuItemResponseDto } from '../dto/menu-item-response.dto';
import { PublicMenuItemResponseDto } from '../dto/menu-item-public-response.dto';
import { PaginatedMenuItemResponseDto } from '../dto/paginated-menu-item-response.dto';
import { PaginatedPublicMenuItemResponseDto } from '../dto/paginated-public-menu-item-response.dto';

@ApiTags('menu')
@Controller('business-units/:businessUnitId/menu')
export class MenuItemsController {
  constructor(
    private readonly getMenuByBusinessUnit: GetMenuByBusinessUnitUseCase,
    private readonly getMenuItemById: GetMenuItemByIdUseCase,
    private readonly addMenuItem: AddMenuItemUseCase,
    private readonly updateMenuItem: UpdateMenuItemUseCase,
    private readonly deactivateMenuItem: DeactivateMenuItemUseCase,
    private readonly activateMenuItem: ActivateMenuItemUseCase,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List a business unit available menu (cursor-paginated)' })
  @ApiOkResponse({ type: PaginatedPublicMenuItemResponseDto })
  async findMenu(
    @Param() { businessUnitId }: BusinessUnitIdParamDto,
    @Query() query: MenuItemsQueryDto,
  ): Promise<PaginatedResponseDto<PublicMenuItemResponseDto>> {
    const limit = sanitizeLimit(query.limit);

    const result = await this.getMenuByBusinessUnit.execute({
      businessUnitId,
      cursor: query.cursor,
      limit,
    });

    return new PaginatedResponseDto(
      result.data.map((readModel) => PublicMenuItemResponseDto.fromReadModel(readModel)),
      result.meta,
    );
  }

  // Static route declared before :menuItemId so it is not captured as a param.
  // Guard is per-method (not class-wide) so the @Public read routes stay open;
  // they carry no principal and would trip the guard otherwise.
  @Roles([UserRole.ADMIN, UserRole.MANAGER])
  @UseGuards(UnitScopeGuard)
  @ScopedToBusinessUnit('businessUnitId')
  @Get('manage')
  @ApiOperation({ summary: 'List the full menu for management, including unavailable items' })
  @ApiOkResponse({ type: PaginatedMenuItemResponseDto })
  async findMenuForManagement(
    @Param() { businessUnitId }: BusinessUnitIdParamDto,
    @Query() query: MenuItemsQueryDto,
  ): Promise<PaginatedResponseDto<MenuItemResponseDto>> {
    const limit = sanitizeLimit(query.limit);

    const result = await this.getMenuByBusinessUnit.execute({
      businessUnitId,
      cursor: query.cursor,
      limit,
      includeUnavailable: true,
    });

    return new PaginatedResponseDto(
      result.data.map((readModel) => MenuItemResponseDto.fromEntity(readModel.menuItem)),
      result.meta,
    );
  }

  @Public()
  @Get(':menuItemId')
  @ApiOperation({ summary: 'Get a single available menu item' })
  @ApiOkResponse({ type: PublicMenuItemResponseDto })
  @ApiNotFoundResponse({ description: 'Menu item not found or not available' })
  async findMenuItem(
    @Param() { businessUnitId, menuItemId }: MenuItemParamsDto,
  ): Promise<PublicMenuItemResponseDto> {
    const readModel = await this.getMenuItemById.execute(menuItemId, businessUnitId);
    return PublicMenuItemResponseDto.fromReadModel(readModel);
  }

  @Roles([UserRole.ADMIN, UserRole.MANAGER])
  @UseGuards(UnitScopeGuard)
  @ScopedToBusinessUnit('businessUnitId')
  @Post()
  @ApiOperation({ summary: 'Add a product to a business unit menu' })
  @ApiCreatedResponse({ type: MenuItemResponseDto })
  @ApiConflictResponse({ description: 'The product is already on this unit menu' })
  @ApiNotFoundResponse({ description: 'The referenced business unit or product does not exist' })
  async addItem(
    @Param() { businessUnitId }: BusinessUnitIdParamDto,
    @Body() body: MenuItemCreateDto,
  ): Promise<MenuItemResponseDto> {
    const item = await this.addMenuItem.execute({
      businessUnitId,
      productId: body.productId,
      customPrice: body.customPrice,
      isAvailable: body.isAvailable,
    });

    return MenuItemResponseDto.fromEntity(item);
  }

  @Roles([UserRole.ADMIN, UserRole.MANAGER])
  @UseGuards(UnitScopeGuard)
  @ScopedToBusinessUnit('businessUnitId')
  @Patch(':menuItemId')
  @ApiOperation({ summary: 'Update a menu item price and/or availability' })
  @ApiOkResponse({ type: MenuItemResponseDto })
  @ApiNotFoundResponse({ description: 'Menu item not found in this business unit' })
  async updateItem(
    @Param() { businessUnitId, menuItemId }: MenuItemParamsDto,
    @Body() body: MenuItemUpdateDto,
  ): Promise<MenuItemResponseDto> {
    const item = await this.updateMenuItem.execute({
      id: menuItemId,
      businessUnitId,
      customPrice: body.customPrice,
      isAvailable: body.isAvailable,
    });

    return MenuItemResponseDto.fromEntity(item);
  }

  @Roles([UserRole.ADMIN, UserRole.MANAGER])
  @UseGuards(UnitScopeGuard)
  @ScopedToBusinessUnit('businessUnitId')
  @Patch(':menuItemId/deactivate')
  @ApiOperation({ summary: 'Deactivate a menu item (set isAvailable to false)' })
  @ApiOkResponse({ type: MenuItemResponseDto })
  @ApiNotFoundResponse({ description: 'Menu item not found in this business unit' })
  async deactivateItem(
    @CurrentUser() actor: JwtPayload,
    @Param() { businessUnitId, menuItemId }: MenuItemParamsDto,
  ): Promise<MenuItemResponseDto> {
    const item = await this.deactivateMenuItem.execute(menuItemId, businessUnitId, actor.sub);
    return MenuItemResponseDto.fromEntity(item);
  }

  @Roles([UserRole.ADMIN, UserRole.MANAGER])
  @UseGuards(UnitScopeGuard)
  @ScopedToBusinessUnit('businessUnitId')
  @Patch(':menuItemId/activate')
  @ApiOperation({ summary: 'Activate a menu item (set isAvailable to true)' })
  @ApiOkResponse({ type: MenuItemResponseDto })
  @ApiNotFoundResponse({ description: 'Menu item not found in this business unit' })
  async activateItem(
    @CurrentUser() actor: JwtPayload,
    @Param() { businessUnitId, menuItemId }: MenuItemParamsDto,
  ): Promise<MenuItemResponseDto> {
    const item = await this.activateMenuItem.execute(menuItemId, businessUnitId, actor.sub);
    return MenuItemResponseDto.fromEntity(item);
  }
}
