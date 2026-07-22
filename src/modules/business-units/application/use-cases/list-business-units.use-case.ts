import { Inject, Injectable } from '@nestjs/common';
import {
  BUSINESS_UNIT_REPOSITORY,
  BusinessUnitFilters,
  type BusinessUnitRepository,
} from '../../domain/repositories/business-unit.repository';
import { BusinessUnitsFetchError } from '../errors/business-units-fetch.error';
import { BusinessUnit } from '../../domain/entities/business-unit.entity';
import { CursorPaginatedResult, buildCursorPage } from '@shared/pagination/pagination';
import { decodeCatalogCursor, encodeCatalogCursor } from '../catalog-keyset-cursor';

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

    // Decode before the fetch: a malformed token is the caller's error (422), not a
    // repository failure, and must not surface as an outage.
    const keyset = cursor === undefined ? undefined : decodeCatalogCursor(cursor);

    let items: BusinessUnit[];
    try {
      items = await this.businessUnits.findMany({
        take: limit + 1,
        keyset,
        filters,
      });
    } catch (err) {
      throw new BusinessUnitsFetchError('Could not retrieve business units.', { cause: err });
    }

    // The token carries the whole sort key, so the next page rebuilds the keyset
    // predicate without re-reading the row it points at.
    return buildCursorPage(items, limit, (businessUnit) =>
      encodeCatalogCursor(businessUnit.createdAt, businessUnit.id),
    );
  }
}
