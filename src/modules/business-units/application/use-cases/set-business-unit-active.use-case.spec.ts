import { beforeEach, describe, expect, it } from '@jest/globals';
import { AuditLogInput, AuditLogger } from '@modules/audit/application/ports/audit-logger.port';
import { AUDIT_ACTIONS } from '@modules/audit/domain/audit-actions';
import { SetBusinessUnitActiveUseCase } from './set-business-unit-active.use-case';
import { BusinessUnit } from '../../domain/entities/business-unit.entity';
import {
  BusinessUnitRepository,
  CreateBusinessUnitInput,
  FindBusinessUnitsInput,
} from '../../domain/repositories/business-unit.repository';
import { BusinessUnitNotFoundError } from '../errors/business-unit-not-found.error';

// In-memory fake. setActive flips the stored flag and returns the unit, or null
// when no unit matches the id, mirroring the conditional UPDATE contract.
class FakeBusinessUnitRepository implements BusinessUnitRepository {
  readonly store = new Map<string, BusinessUnit>();
  readonly setActiveCalls: { id: string; isActive: boolean }[] = [];

  seed(id: string, isActive: boolean): void {
    this.store.set(id, this.build(id, isActive));
  }

  findById(): Promise<BusinessUnit | null> {
    return Promise.reject(new Error('not used'));
  }

  findMany(_input: FindBusinessUnitsInput): Promise<BusinessUnit[]> {
    return Promise.reject(new Error('not used'));
  }

  create(_input: CreateBusinessUnitInput): Promise<BusinessUnit> {
    return Promise.reject(new Error('not used'));
  }

  setActive(id: string, isActive: boolean): Promise<BusinessUnit | null> {
    this.setActiveCalls.push({ id, isActive });
    const current = this.store.get(id);
    if (!current) {
      return Promise.resolve(null);
    }
    const updated = this.build(id, isActive);
    this.store.set(id, updated);
    return Promise.resolve(updated);
  }

  private build(id: string, isActive: boolean): BusinessUnit {
    return new BusinessUnit(
      id,
      'Nexio Pelourinho',
      '12345678000190',
      'Largo do Pelourinho, 10',
      'Salvador',
      '7132223344',
      isActive,
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-01-02T00:00:00Z'),
    );
  }
}

// Records entries and, when armed, rejects to prove audit failures never break
// the toggle outcome.
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

describe('SetBusinessUnitActiveUseCase', () => {
  let repo: FakeBusinessUnitRepository;
  let audit: FakeAuditLogger;
  let useCase: SetBusinessUnitActiveUseCase;

  beforeEach(() => {
    repo = new FakeBusinessUnitRepository();
    audit = new FakeAuditLogger();
    useCase = new SetBusinessUnitActiveUseCase(repo, audit);
  });

  it('activates a unit and returns it with isActive true', async () => {
    repo.seed('bu-1', false);

    const result = await useCase.execute('bu-1', true, 'admin-1');

    expect(result.isActive).toBe(true);
    expect(repo.setActiveCalls).toEqual([{ id: 'bu-1', isActive: true }]);
  });

  it('deactivates a unit and returns it with isActive false', async () => {
    repo.seed('bu-1', true);

    const result = await useCase.execute('bu-1', false, 'admin-1');

    expect(result.isActive).toBe(false);
  });

  it('is idempotent: activating an already-active unit returns the active state', async () => {
    repo.seed('bu-1', true);

    const result = await useCase.execute('bu-1', true, 'admin-1');

    expect(result.isActive).toBe(true);
  });

  it('throws BusinessUnitNotFoundError when the unit does not exist', async () => {
    await expect(useCase.execute('ghost', true, 'admin-1')).rejects.toBeInstanceOf(
      BusinessUnitNotFoundError,
    );
  });

  it('audits the activation under the actor', async () => {
    repo.seed('bu-1', false);

    await useCase.execute('bu-1', true, 'admin-1');

    expect(audit.entries[0]).toMatchObject({
      userId: 'admin-1',
      action: AUDIT_ACTIONS.BUSINESS_UNIT_ACTIVATED,
      entity: 'BusinessUnit',
      entityId: 'bu-1',
      metadata: { isActive: true },
    });
  });

  it('audits the deactivation under the actor', async () => {
    repo.seed('bu-1', true);

    await useCase.execute('bu-1', false, 'admin-1');

    expect(audit.entries[0]).toMatchObject({
      action: AUDIT_ACTIONS.BUSINESS_UNIT_DEACTIVATED,
      metadata: { isActive: false },
    });
  });

  it('still resolves the toggle when the audit logger throws', async () => {
    repo.seed('bu-1', false);
    audit.shouldThrow = true;

    const result = await useCase.execute('bu-1', true, 'admin-1');

    expect(result.isActive).toBe(true);
  });
});
