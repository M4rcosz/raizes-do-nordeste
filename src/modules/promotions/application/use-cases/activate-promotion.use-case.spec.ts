import { beforeEach, describe, expect, it } from '@jest/globals';
import { Money } from '@shared/domain/value-objects/money';
import type { TransactionContext } from '@shared/transaction/transaction-runner.port';
import { UserRole } from '@modules/identity/domain/value-objects/user-role';
import type {
  AuditLogInput,
  AuditLogger,
} from '@modules/audit/application/ports/audit-logger.port';
import { AUDIT_ACTIONS } from '@modules/audit/domain/audit-actions';
import { ActivatePromotionUseCase } from './activate-promotion.use-case';
import { Promotion } from '../../domain/entities/promotion.entity';
import { DiscountType } from '../../domain/value-objects/discount-type';
import { PromotionNotFoundError } from '../errors/promotion-not-found.error';
import type { PromotionActor } from '../promotion-actor';
import type {
  CreatePromotionInput,
  FindPromotionsByBusinessUnitInput,
  PromotionRepository,
  RecordOrderPromotionInput,
  UpdatePromotionInput,
} from '../../domain/repositories/promotion.repository';

const existing = (isActive = false): Promotion =>
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
  readonly updates: { id: string; input: UpdatePromotionInput }[] = [];

  seed(promotion: Promotion | null): void {
    this.stored = promotion;
  }
  findById(_id: string): Promise<Promotion | null> {
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
  log(input: AuditLogInput): Promise<void> {
    this.entries.push(input);
    return Promise.resolve();
  }
}

const owner = (businessUnitId = 'bu-1'): PromotionActor => ({
  role: UserRole.MANAGER,
  businessUnitIds: [businessUnitId],
});

describe('ActivatePromotionUseCase', () => {
  let repo: FakePromotionRepository;
  let audit: FakeAuditLogger;
  let useCase: ActivatePromotionUseCase;

  beforeEach(() => {
    repo = new FakePromotionRepository();
    audit = new FakeAuditLogger();
    useCase = new ActivatePromotionUseCase(repo, audit);
  });

  it('flips isActive to true and audits the actor', async () => {
    repo.seed(existing(false));

    const updated = await useCase.execute('promo-1', owner(), 'user-9');

    expect(repo.updates).toEqual([{ id: 'promo-1', input: { isActive: true } }]);
    expect(updated.isActive).toBe(true);
    expect(audit.entries).toEqual([
      {
        userId: 'user-9',
        action: AUDIT_ACTIONS.PROMOTION_ACTIVATED,
        entity: 'Promotion',
        entityId: 'promo-1',
        metadata: { businessUnitId: 'bu-1', isActive: true },
      },
    ]);
  });

  it('hides a foreign-unit promotion behind PromotionNotFoundError and never updates', async () => {
    repo.seed(existing(false));

    await expect(useCase.execute('promo-1', owner('bu-2'), 'user-9')).rejects.toBeInstanceOf(
      PromotionNotFoundError,
    );
    expect(repo.updates).toEqual([]);
  });
});
