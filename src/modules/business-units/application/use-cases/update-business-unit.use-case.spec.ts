import { beforeEach, describe, expect, it } from '@jest/globals';
import { AuditLogInput, AuditLogger } from '@modules/audit/application/ports/audit-logger.port';
import { AUDIT_ACTIONS } from '@modules/audit/domain/audit-actions';
import {
  UpdateBusinessUnitInput,
  UpdateBusinessUnitUseCase,
} from './update-business-unit.use-case';
import { BusinessUnit } from '../../domain/entities/business-unit.entity';
import {
  BusinessUnitRepository,
  CreateBusinessUnitInput,
  FindBusinessUnitsInput,
} from '../../domain/repositories/business-unit.repository';
import { BusinessUnitNotFoundError } from '../errors/business-unit-not-found.error';
import { BusinessUnitAlreadyExistsError } from '../../domain/errors/business-unit-already-exists.error';

// In-memory fake. findById returns the seeded unit; update writes back the
// passed entity and returns it, or null when flagged (delete race), or throws
// when a unique clash is simulated.
class FakeBusinessUnitRepository implements BusinessUnitRepository {
  readonly store = new Map<string, BusinessUnit>();
  readonly updated: BusinessUnit[] = [];
  updateReturnsNull = false;
  updateThrowsConflict = false;

  seed(unit: BusinessUnit): void {
    this.store.set(unit.id, unit);
  }

  findById(id: string): Promise<BusinessUnit | null> {
    return Promise.resolve(this.store.get(id) ?? null);
  }

  findMany(_input: FindBusinessUnitsInput): Promise<BusinessUnit[]> {
    return Promise.reject(new Error('not used'));
  }

  create(_input: CreateBusinessUnitInput): Promise<BusinessUnit> {
    return Promise.reject(new Error('not used'));
  }

  update(unit: BusinessUnit): Promise<BusinessUnit | null> {
    if (this.updateThrowsConflict) {
      return Promise.reject(
        new BusinessUnitAlreadyExistsError(
          `A business unit with phone "${unit.phone}" already exists.`,
        ),
      );
    }
    this.updated.push(unit);
    if (this.updateReturnsNull) {
      return Promise.resolve(null);
    }
    this.store.set(unit.id, unit);
    return Promise.resolve(unit);
  }

  setActive(): Promise<BusinessUnit | null> {
    return Promise.reject(new Error('not used'));
  }
}

class FakeAuditLogger implements AuditLogger {
  readonly entries: AuditLogInput[] = [];
  shouldThrow = false;

  log(input: AuditLogInput): Promise<void> {
    if (this.shouldThrow) {
      return Promise.reject(new Error('audit sink down'));
    }
    this.entries.push(input);
    return Promise.resolve();
  }
}

const buildBusinessUnit = (): BusinessUnit =>
  new BusinessUnit(
    'unit-1',
    'Nexio Pelourinho',
    '12345678000190',
    'Largo do Pelourinho, 10',
    'Salvador',
    '7132223344',
    true,
    new Date('2026-01-01T00:00:00Z'),
    new Date('2026-01-02T00:00:00Z'),
  );

describe('UpdateBusinessUnitUseCase', () => {
  let repo: FakeBusinessUnitRepository;
  let audit: FakeAuditLogger;
  let useCase: UpdateBusinessUnitUseCase;

  beforeEach(() => {
    repo = new FakeBusinessUnitRepository();
    audit = new FakeAuditLogger();
    useCase = new UpdateBusinessUnitUseCase(repo, audit);
  });

  it('applies the patch and persists the updated unit', async () => {
    repo.seed(buildBusinessUnit());

    const result = await useCase.execute(
      'unit-1',
      { name: 'Nexio Rio Vermelho', phone: '7133334455' },
      'admin-1',
    );

    expect(result.name).toBe('Nexio Rio Vermelho');
    expect(result.phone).toBe('7133334455');
    // Untouched fields carry over from the loaded unit.
    expect(result.address).toBe('Largo do Pelourinho, 10');
    expect(result.city).toBe('Salvador');
    expect(repo.updated).toHaveLength(1);
  });

  it('never patches cnpj or isActive', async () => {
    repo.seed(buildBusinessUnit());

    const result = await useCase.execute('unit-1', { name: 'Nexio Rio Vermelho' }, 'admin-1');

    expect(result.cnpj).toBe('12345678000190');
    expect(result.isActive).toBe(true);
  });

  it('throws BusinessUnitNotFoundError when the unit does not exist', async () => {
    await expect(
      useCase.execute('ghost', { name: 'Nexio Rio Vermelho' }, 'admin-1'),
    ).rejects.toBeInstanceOf(BusinessUnitNotFoundError);
  });

  it('throws BusinessUnitNotFoundError when the row is deleted before the write (race)', async () => {
    repo.seed(buildBusinessUnit());
    repo.updateReturnsNull = true;

    await expect(
      useCase.execute('unit-1', { name: 'Nexio Rio Vermelho' }, 'admin-1'),
    ).rejects.toBeInstanceOf(BusinessUnitNotFoundError);
  });

  it('propagates BusinessUnitAlreadyExistsError from the repository', async () => {
    repo.seed(buildBusinessUnit());
    repo.updateThrowsConflict = true;

    await expect(
      useCase.execute('unit-1', { phone: '7133334455' }, 'admin-1'),
    ).rejects.toBeInstanceOf(BusinessUnitAlreadyExistsError);
    // Nothing to audit when the write failed.
    expect(audit.entries).toHaveLength(0);
  });

  it('audits the update with only the changed field names', async () => {
    repo.seed(buildBusinessUnit());

    await useCase.execute('unit-1', { name: 'Nexio Rio Vermelho', phone: '7133334455' }, 'admin-1');

    expect(audit.entries[0]).toMatchObject({
      userId: 'admin-1',
      action: AUDIT_ACTIONS.BUSINESS_UNIT_UPDATED,
      entity: 'BusinessUnit',
      entityId: 'unit-1',
      metadata: { updatedFields: ['name', 'phone'] },
    });
  });

  it('audits only real patchable fields, ignoring non-domain carrier keys', async () => {
    repo.seed(buildBusinessUnit());

    // Simulates the DTO's validation-only carrier (_atLeastOneField) surviving
    // into the input object; it must never leak into the audit trail.
    const inputWithCarrier: UpdateBusinessUnitInput & Record<string, unknown> = {
      name: 'Nexio Rio Vermelho',
    };
    inputWithCarrier._atLeastOneField = 'boom';

    await useCase.execute('unit-1', inputWithCarrier, 'admin-1');

    expect(audit.entries[0].metadata).toEqual({ updatedFields: ['name'] });
  });

  it('still resolves the update when the audit logger throws', async () => {
    repo.seed(buildBusinessUnit());
    audit.shouldThrow = true;

    const result = await useCase.execute('unit-1', { name: 'Nexio Rio Vermelho' }, 'admin-1');

    expect(result.name).toBe('Nexio Rio Vermelho');
  });
});
