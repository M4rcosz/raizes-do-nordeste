import { beforeEach, describe, expect, it } from '@jest/globals';
import { Money } from '@shared/domain/value-objects/money';
import type { TransactionContext } from '@shared/transaction/transaction-runner.port';
import { UserRole } from '@modules/identity/domain/value-objects/user-role';
import type {
  AuditLogInput,
  AuditLogger,
} from '@modules/audit/application/ports/audit-logger.port';
import { AUDIT_ACTIONS } from '@modules/audit/domain/audit-actions';
import { DeactivatePromotionUseCase } from './deactivate-promotion.use-case';
import { Promotion } from '../../domain/entities/promotion.entity';
import { DiscountType } from '../../domain/value-objects/discount-type';
import { PromotionNotFoundError } from '../errors/promotion-not-found.error';
import { PromotionsFetchError } from '../errors/promotions-fetch.error';
import type { PromotionActor } from '../promotion-actor';
import type {
  CreatePromotionInput,
  FindActivePromotionsInput,
  FindPromotionsByBusinessUnitInput,
  PromotionRepository,
  RecordOrderPromotionInput,
  UpdatePromotionInput,
} from '../../domain/repositories/promotion.repository';

const existing = (isActive = true): Promotion =>
  new Promotion(
    'promo-1',
    'bu-1',
    'Almoço',
    DiscountType.PERCENTAGE,
    Money.fromDecimalString('10.00'),
    Money.fromDecimalString('30.00'),
    new Date('2026-06-01T00:00:00.000Z'),
    new Date('2026-06-30T00:00:00.000Z'),
    isActive,
    new Date(),
    new Date(),
  );

class FakePromotionRepository implements PromotionRepository {
  private stored: Promotion | null = null;
  private findError: Error | null = null;
  readonly updates: { id: string; input: UpdatePromotionInput }[] = [];

  seed(promotion: Promotion | null): void {
    this.stored = promotion;
  }
  failFindWith(error: Error): void {
    this.findError = error;
  }

  findById(_id: string): Promise<Promotion | null> {
    if (this.findError) {
      return Promise.reject(this.findError);
    }
    return Promise.resolve(this.stored);
  }
  update(id: string, input: UpdatePromotionInput): Promise<Promotion> {
    this.updates.push({ id, input });
    const base = this.stored as Promotion;
    return Promise.resolve(
      new Promotion(
        base.id,
        base.businessUnitId,
        base.name,
        base.discountType,
        base.discountValue,
        base.minOrderValue,
        base.startDate,
        base.endDate,
        input.isActive ?? base.isActive,
        base.createdAt,
        new Date(),
      ),
    );
  }
  create(_input: CreatePromotionInput): Promise<Promotion> {
    throw new Error('not used');
  }
  findManyActive(_input: FindActivePromotionsInput): Promise<Promotion[]> {
    throw new Error('not used');
  }
  findManyByBusinessUnit(_input: FindPromotionsByBusinessUnitInput): Promise<Promotion[]> {
    throw new Error('not used');
  }
  findActiveEligible(_bu: string, _now: Date, _tx?: TransactionContext): Promise<Promotion[]> {
    throw new Error('not used');
  }
  recordOrderPromotion(_input: RecordOrderPromotionInput, _tx: TransactionContext): Promise<void> {
    throw new Error('not used');
  }
}

class FakeAuditLogger implements AuditLogger {
  readonly entries: AuditLogInput[] = [];
  private throwOnce = false;

  failNext(): void {
    this.throwOnce = true;
  }
  log(input: AuditLogInput): Promise<void> {
    if (this.throwOnce) {
      this.throwOnce = false;
      return Promise.reject(new Error('audit down'));
    }
    this.entries.push(input);
    return Promise.resolve();
  }
}

const owner = (businessUnitId = 'bu-1'): PromotionActor => ({
  role: UserRole.MANAGER,
  businessUnitIds: [businessUnitId],
});
const admin: PromotionActor = { role: UserRole.ADMIN, businessUnitIds: [] };

describe('DeactivatePromotionUseCase', () => {
  let repo: FakePromotionRepository;
  let audit: FakeAuditLogger;
  let useCase: DeactivatePromotionUseCase;

  beforeEach(() => {
    repo = new FakePromotionRepository();
    audit = new FakeAuditLogger();
    useCase = new DeactivatePromotionUseCase(repo, audit);
  });

  it('flips isActive to false and audits the actor', async () => {
    repo.seed(existing(true));

    const updated = await useCase.execute('promo-1', owner(), 'user-9');

    expect(repo.updates).toEqual([{ id: 'promo-1', input: { isActive: false } }]);
    expect(updated.isActive).toBe(false);
    expect(audit.entries).toEqual([
      {
        userId: 'user-9',
        action: AUDIT_ACTIONS.PROMOTION_DEACTIVATED,
        entity: 'Promotion',
        entityId: 'promo-1',
        metadata: { businessUnitId: 'bu-1', isActive: false },
      },
    ]);
  });

  it('is idempotent: deactivating an already-inactive promotion still writes false', async () => {
    repo.seed(existing(false));

    const updated = await useCase.execute('promo-1', owner(), 'user-9');

    expect(updated.isActive).toBe(false);
    expect(repo.updates).toEqual([{ id: 'promo-1', input: { isActive: false } }]);
  });

  it('lets a global ADMIN deactivate any unit promotion', async () => {
    repo.seed(existing(true));

    const updated = await useCase.execute('promo-1', admin, 'admin-1');

    expect(updated.isActive).toBe(false);
  });

  it('hides a foreign-unit promotion behind PromotionNotFoundError and never updates', async () => {
    repo.seed(existing(true));

    await expect(useCase.execute('promo-1', owner('bu-2'), 'user-9')).rejects.toBeInstanceOf(
      PromotionNotFoundError,
    );
    expect(repo.updates).toEqual([]);
  });

  it('throws PromotionNotFoundError when the promotion does not exist', async () => {
    repo.seed(null);

    await expect(useCase.execute('missing', owner(), 'user-9')).rejects.toBeInstanceOf(
      PromotionNotFoundError,
    );
    expect(repo.updates).toEqual([]);
  });

  it('wraps a findById failure as PromotionsFetchError, chaining the cause, and never updates', async () => {
    const cause = new Error('db down');
    repo.failFindWith(cause);

    await expect(useCase.execute('promo-1', owner(), 'user-9')).rejects.toBeInstanceOf(
      PromotionsFetchError,
    );
    await expect(useCase.execute('promo-1', owner(), 'user-9')).rejects.toMatchObject({ cause });
    expect(repo.updates).toEqual([]);
  });

  it('still returns the updated promotion when the audit write fails', async () => {
    repo.seed(existing(true));
    audit.failNext();

    const updated = await useCase.execute('promo-1', owner(), 'user-9');

    expect(updated.isActive).toBe(false);
    expect(audit.entries).toEqual([]);
  });
});
