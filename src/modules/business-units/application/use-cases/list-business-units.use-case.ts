import { Inject, Injectable } from '@nestjs/common';
import {
  BUSINESS_UNIT_REPOSITORY,
  BusinessUnitFilters,
  type BusinessUnitRepository,
} from '../../domain/repositories/business-unit.repository';
import { BusinessUnitsFetchError } from '../errors/business-units-fetch.error';
import { BusinessUnit } from '../../domain/entities/business-unit.entity';
import { CursorPaginatedResult, buildCursorMeta } from '@shared/pagination/pagination';

export interface ListBusinessUnitsInput {
  cursor?: string;
  limit: number;
  filters?: BusinessUnitFilters;
}

@Injectable()
export class ListBusinessUnitsUseCase {
  constructor(
    @Inject(BUSINESS_UNIT_REPOSITORY)
    private readonly businessUnits: BusinessUnitRepository,
  ) {}

  async execute(input: ListBusinessUnitsInput): Promise<CursorPaginatedResult<BusinessUnit>> {
    const { cursor, limit, filters } = input;

    let items: BusinessUnit[];
    try {
      items = await this.businessUnits.findMany({
        pagination: { cursor, take: limit + 1 },
        filters,
      });
    } catch (err) {
      throw new BusinessUnitsFetchError('Could not retrieve business units.', { cause: err });
    }

    const hasMore = items.length > limit;
    const trimmed = hasMore ? items.slice(0, limit) : items;
    const lastItemId = trimmed[trimmed.length - 1]?.id;

    return {
      data: trimmed,
      meta: buildCursorMeta(limit, hasMore, lastItemId),
    };
  }
}
