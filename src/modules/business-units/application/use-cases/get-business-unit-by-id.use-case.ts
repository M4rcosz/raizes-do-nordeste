import { Inject, Injectable } from '@nestjs/common';
import { BusinessUnit } from '../../domain/entities/business-unit.entity';
import { BusinessUnitsFetchError } from '../errors/business-units-fetch.error';
import { BusinessUnitNotFoundError } from '../errors/business-unit-not-found.error';
import {
  BUSINESS_UNIT_REPOSITORY,
  type BusinessUnitRepository,
} from '../../domain/repositories/business-unit.repository';

export interface GetBusinessUnitByIdOptions {
  /** When true, an inactive unit is treated as not found (public callers never see inactive). */
  activeOnly: boolean;
}

@Injectable()
export class GetBusinessUnitByIdUseCase {
  constructor(
    @Inject(BUSINESS_UNIT_REPOSITORY)
    private readonly businessUnits: BusinessUnitRepository,
  ) {}

  async execute(id: string, opts: GetBusinessUnitByIdOptions): Promise<BusinessUnit> {
    let businessUnit: BusinessUnit | null;

    try {
      businessUnit = await this.businessUnits.findById(id);
    } catch (err) {
      throw new BusinessUnitsFetchError(`Could not retrieve business unit by id "${id}".`, {
        cause: err,
      });
    }

    if (!businessUnit || (opts.activeOnly && !businessUnit.isActive)) {
      throw new BusinessUnitNotFoundError(`Business unit with id "${id}" not found.`);
    }

    return businessUnit;
  }
}
