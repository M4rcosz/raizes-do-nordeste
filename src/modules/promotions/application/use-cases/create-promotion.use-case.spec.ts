import { beforeEach, describe, expect, it } from '@jest/globals';
import { Money } from '@shared/domain/value-objects/money';
import { BusinessUnitScopeError } from '@shared/errors/application/business-unit-scope.error';
import type { TransactionContext } from '@shared/transaction/transaction-runner.port';
import { UserRole } from '@modules/identity/domain/value-objects/user-role';
import { CreatePromotionUseCase, type CreatePromotionDraft } from './create-promotion.use-case';
import { Promotion } from '../../domain/entities/promotion.entity';
import { DiscountType } from '../../domain/value-objects/discount-type';
import { PromotionNotEligibleError } from '../../domain/errors/promotion-not-eligible.error';
import type { PromotionActor } from '../promotion-actor';
import type {
  CreatePromotionInput,
  FindPromotionsByBusinessUnitInput,
  PromotionRepository,
  RecordOrderPromotionInput,
  UpdatePromotionInput,
} from '../../domain/repositories/promotion.repository';

class FakePromotionRepository implements PromotionRepository {
  readonly created: CreatePromotionInput[] = [];

  create(input: CreatePromotionInput): Promise<Promotion> {
    this.created.push(input);
    return Promise.resolve(
      new Promotion(
        'promo-new',
        input.businessUnitId,
        input.name,
        input.discountType,
        Money.fromDecimalString(input.discountValue),
        Money.fromDecimalString(input.minOrderValue),
        input.startDate,
        input.endDate,
        input.isActive ?? true,
        new Date(),
        new Date(),
      ),
    );
  }
  findById(_id: string): Promise<Promotion | null> {
    throw new Error('not used');
  }
  findManyByBusinessUnit(_input: FindPromotionsByBusinessUnitInput): Promise<Promotion[]> {
    throw new Error('not used');
  }
  update(_id: string, _input: UpdatePromotionInput): Promise<Promotion> {
    throw new Error('not used');
  }
  findActiveEligible(_bu: string, _now: Date, _tx?: TransactionContext): Promise<Promotion[]> {
    throw new Error('not used');
  }
  recordOrderPromotion(_input: RecordOrderPromotionInput, _tx: TransactionContext): Promise<void> {
    throw new Error('not used');
  }
}

// The unit is no longer in the draft; it comes from the actor's claim.
const draft = (overrides: Partial<CreatePromotionDraft> = {}): CreatePromotionDraft => ({
  name: 'Almoço',
  discountType: DiscountType.PERCENTAGE,
  discountValue: '10.00',
  minOrderValue: '30.00',
  startDate: new Date('2026-06-01T00:00:00.000Z'),
  endDate: new Date('2026-06-30T00:00:00.000Z'),
  ...overrides,
});

const manager = (businessUnitId: string | null = 'bu-1'): PromotionActor => ({
  role: UserRole.MANAGER,
  businessUnitId,
});

describe('CreatePromotionUseCase', () => {
  let repo: FakePromotionRepository;
  let useCase: CreatePromotionUseCase;

  beforeEach(() => {
    repo = new FakePromotionRepository();
    useCase = new CreatePromotionUseCase(repo);
  });

  it('persists a valid promotion scoped to the actor unit and returns the created entity', async () => {
    const promotion = await useCase.execute(draft(), manager('bu-7'));

    expect(repo.created).toHaveLength(1);
    expect(repo.created[0].businessUnitId).toBe('bu-7');
    expect(promotion).toBeInstanceOf(Promotion);
    expect(promotion.id).toBe('promo-new');
    expect(promotion.discountValue.toDecimalString()).toBe('10.00');
  });

  it('rejects a global (null-scope) actor with not-found and never persists', async () => {
    await expect(useCase.execute(draft(), manager(null))).rejects.toBeInstanceOf(
      BusinessUnitScopeError,
    );
    expect(repo.created).toEqual([]);
  });

  it('rejects when endDate is before startDate (dead window) and never persists', async () => {
    await expect(
      useCase.execute(
        draft({
          startDate: new Date('2026-06-30T00:00:00.000Z'),
          endDate: new Date('2026-06-01T00:00:00.000Z'),
        }),
        manager(),
      ),
    ).rejects.toBeInstanceOf(PromotionNotEligibleError);
    expect(repo.created).toEqual([]);
  });

  it('rejects when endDate equals startDate (empty window)', async () => {
    const sameInstant = new Date('2026-06-01T00:00:00.000Z');
    await expect(
      useCase.execute(draft({ startDate: sameInstant, endDate: new Date(sameInstant) }), manager()),
    ).rejects.toBeInstanceOf(PromotionNotEligibleError);
    expect(repo.created).toEqual([]);
  });
});
