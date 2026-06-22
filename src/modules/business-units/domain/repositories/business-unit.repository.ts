import { BusinessUnit } from '../entities/business-unit.entity';
import { CursorPaginationParams } from '@shared/pagination/pagination';

/**
 * Query filters for listing business units. All fields are optional.
 * `search` performs a case-insensitive substring match on `name`.
 * `city` performs an exact match. `isActive` filters by active flag.
 */
export interface BusinessUnitFilters {
  search?: string;
  city?: string;
  isActive?: boolean;
}

export interface FindBusinessUnitsInput {
  pagination: CursorPaginationParams;
  filters?: BusinessUnitFilters;
}

export interface CreateBusinessUnitInput {
  name: string;
  cnpj: string;
  address: string;
  city: string;
  phone: string;
}

export interface BusinessUnitRepository {
  findById(id: string): Promise<BusinessUnit | null>;
  findMany(input: FindBusinessUnitsInput): Promise<BusinessUnit[]>;
  create(input: CreateBusinessUnitInput): Promise<BusinessUnit>;
}

export const BUSINESS_UNIT_REPOSITORY = Symbol('BusinessUnitRepository');
