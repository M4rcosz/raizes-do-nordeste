import { Inject, Injectable } from '@nestjs/common';
import { BusinessUnit } from '../../domain/entities/business-unit.entity';
import {
  type CreateBusinessUnitInput,
  BUSINESS_UNIT_REPOSITORY,
  type BusinessUnitRepository,
} from '../../domain/repositories/business-unit.repository';

@Injectable()
export class CreateBusinessUnitUseCase {
  constructor(
    @Inject(BUSINESS_UNIT_REPOSITORY)
    private readonly businessUnits: BusinessUnitRepository,
  ) {}

  execute(input: CreateBusinessUnitInput): Promise<BusinessUnit> {
    return this.businessUnits.create(input);
  }
}
