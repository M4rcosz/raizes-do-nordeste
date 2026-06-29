import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CreateBusinessUnitUseCase } from '../../../application/use-cases/create-business-unit.use-case';
import { ListBusinessUnitsUseCase } from '../../../application/use-cases/list-business-units.use-case';
import { GetBusinessUnitByIdUseCase } from '../../../application/use-cases/get-business-unit-by-id.use-case';
import { SetBusinessUnitActiveUseCase } from '../../../application/use-cases/set-business-unit-active.use-case';
import { BusinessUnitResponseDto } from '../dto/business-unit-response.dto';
import { PublicBusinessUnitResponseDto } from '../dto/business-unit-public-response.dto';
import {
  PaginatedBusinessUnitResponseDto,
  PaginatedPublicBusinessUnitResponseDto,
} from '../dto/paginated-business-unit-response.dto';
import { BusinessUnitCreateDto } from '../dto/business-unit-create.dto';
import { BusinessUnitByIdParamDto, BusinessUnitsQueryDto } from '../dto/business-unit-query.dto';
import { PaginatedResponseDto } from '@shared/pagination/paginated-response.dto';
import { sanitizeLimit } from '@shared/pagination/pagination';
import { BusinessUnitFilters } from '../../../domain/repositories/business-unit.repository';
import { Public } from '@shared/auth/public.decorator';
import { Roles } from '@shared/auth/roles.decorator';
import { CurrentUser } from '@shared/auth/current-user.decorator';
import type { JwtPayload } from '@shared/auth/jwt-payload.type';

@ApiTags('business-units')
@Controller('business-units')
export class BusinessUnitsController {
  constructor(
    private readonly createBusinessUnit: CreateBusinessUnitUseCase,
    private readonly listBusinessUnits: ListBusinessUnitsUseCase,
    private readonly getBusinessUnitById: GetBusinessUnitByIdUseCase,
    private readonly setBusinessUnitActive: SetBusinessUnitActiveUseCase,
  ) {}

  @Roles(['ADMIN'])
  @Post()
  @ApiOperation({ summary: 'Create a new business unit' })
  @ApiCreatedResponse({ type: BusinessUnitResponseDto })
  @ApiConflictResponse({
    description: 'A business unit with the same cnpj or phone already exists',
  })
  async create(@Body() dto: BusinessUnitCreateDto): Promise<BusinessUnitResponseDto> {
    const unit = await this.createBusinessUnit.execute(dto);
    return BusinessUnitResponseDto.fromEntity(unit);
  }

  @Roles(['ADMIN'])
  @Patch(':id/activate')
  @ApiOperation({ summary: 'Activate a business unit (set isActive to true)' })
  @ApiOkResponse({ type: BusinessUnitResponseDto })
  @ApiNotFoundResponse({ description: 'Business unit not found' })
  async activate(
    @CurrentUser() actor: JwtPayload,
    @Param() { id }: BusinessUnitByIdParamDto,
  ): Promise<BusinessUnitResponseDto> {
    const unit = await this.setBusinessUnitActive.execute(id, true, actor.sub);
    return BusinessUnitResponseDto.fromEntity(unit);
  }

  @Roles(['ADMIN'])
  @Patch(':id/deactivate')
  @ApiOperation({ summary: 'Deactivate a business unit (set isActive to false)' })
  @ApiOkResponse({ type: BusinessUnitResponseDto })
  @ApiNotFoundResponse({ description: 'Business unit not found' })
  async deactivate(
    @CurrentUser() actor: JwtPayload,
    @Param() { id }: BusinessUnitByIdParamDto,
  ): Promise<BusinessUnitResponseDto> {
    const unit = await this.setBusinessUnitActive.execute(id, false, actor.sub);
    return BusinessUnitResponseDto.fromEntity(unit);
  }

  // Route order matters: the static 'internal' paths must stay declared before
  // the ':id' routes below, otherwise Nest would match /internal as :id and the
  // role-gated reads would fall through to the public handlers. Do not reorder.
  @Roles(['ADMIN', 'MANAGER'])
  @Get('internal')
  @ApiOperation({ summary: 'List business units with full detail (cursor-paginated)' })
  @ApiOkResponse({ type: PaginatedBusinessUnitResponseDto })
  async findInternal(
    @Query() query: BusinessUnitsQueryDto,
  ): Promise<PaginatedResponseDto<BusinessUnitResponseDto>> {
    const { limit: rawLimit, search, city, isActive, cursor } = query;
    const limit = sanitizeLimit(rawLimit);
    const filters = this.buildFilters(search, city, isActive);

    const result = await this.listBusinessUnits.execute({ cursor, limit, filters });

    return new PaginatedResponseDto(
      result.data.map((unit) => BusinessUnitResponseDto.fromEntity(unit)),
      result.meta,
    );
  }

  @Roles(['ADMIN', 'MANAGER'])
  @Get('internal/:id')
  @ApiOperation({ summary: 'Get a business unit by ID with full detail' })
  @ApiOkResponse({ type: BusinessUnitResponseDto })
  @ApiNotFoundResponse({ description: 'Business unit not found' })
  async findInternalById(
    @Param() { id }: BusinessUnitByIdParamDto,
  ): Promise<BusinessUnitResponseDto> {
    const unit = await this.getBusinessUnitById.execute(id, { activeOnly: false });
    return BusinessUnitResponseDto.fromEntity(unit);
  }

  @Public()
  @Get()
  @ApiOperation({ summary: 'List active business units (cursor-paginated)' })
  @ApiOkResponse({ type: PaginatedPublicBusinessUnitResponseDto })
  async findActive(
    @Query() query: BusinessUnitsQueryDto,
  ): Promise<PaginatedResponseDto<PublicBusinessUnitResponseDto>> {
    const { limit: rawLimit, search, city, cursor } = query;
    const limit = sanitizeLimit(rawLimit);
    // Public listing never exposes inactive units, regardless of query.
    const filters = this.buildFilters(search, city, true);

    const result = await this.listBusinessUnits.execute({ cursor, limit, filters });

    return new PaginatedResponseDto(
      result.data.map((unit) => PublicBusinessUnitResponseDto.fromEntity(unit)),
      result.meta,
    );
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get an active business unit by ID' })
  @ApiOkResponse({ type: PublicBusinessUnitResponseDto })
  @ApiNotFoundResponse({ description: 'Business unit not found' })
  async findById(
    @Param() { id }: BusinessUnitByIdParamDto,
  ): Promise<PublicBusinessUnitResponseDto> {
    const unit = await this.getBusinessUnitById.execute(id, { activeOnly: true });
    return PublicBusinessUnitResponseDto.fromEntity(unit);
  }

  private buildFilters(
    search: string | undefined,
    city: string | undefined,
    isActive: boolean | undefined,
  ): BusinessUnitFilters | undefined {
    const trimmedSearch = search?.trim() || undefined;
    const trimmedCity = city?.trim() || undefined;
    if (!trimmedSearch && !trimmedCity && isActive === undefined) {
      return undefined;
    }
    return { search: trimmedSearch, city: trimmedCity, isActive };
  }
}
