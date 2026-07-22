import { BusinessUnit } from '../entities/business-unit.entity';
import type { TimestampKeyset } from '@shared/pagination/keyset-cursor';

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

/**
 * Deliberately NOT CursorPaginationParams: `keyset` is the sort key of the previous
 * page's last row, not a row id to seek to. The WHERE here is built from toggleable
 * flags, so the row a positional cursor names can stop matching between two requests
 * and `skip: 1` would then drop the following row. Here the keyset timestamp is
 * createdAt.
 */
export interface FindBusinessUnitsInput {
  take: number;
  keyset?: TimestampKeyset;
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
  /**
   * Persists the editable fields of an already-patched entity. Returns null when
   * no unit matches the id (deleted between read and write) so the use case can
   * raise a not-found. Throws BusinessUnitAlreadyExistsError on a unique clash.
   */
  update(unit: BusinessUnit): Promise<BusinessUnit | null>;
  /**
   * Flips the active flag. Idempotent by design: setting the value it already
   * holds is a no-op write that still returns the unit. Returns null when no unit
   * matches the id so the use case can raise a not-found.
   */
  setActive(id: string, isActive: boolean): Promise<BusinessUnit | null>;
}

export const BUSINESS_UNIT_REPOSITORY = Symbol('BusinessUnitRepository');
