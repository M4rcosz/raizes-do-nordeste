import { beforeEach, describe, expect, it } from '@jest/globals';
import { Money } from '@shared/domain/value-objects/money';
import type { TransactionContext } from '@shared/transaction/transaction-runner.port';
import { UserRole } from '@modules/identity/domain/value-objects/user-role';
import { UpdatePromotionUseCase } from './update-promotion.use-case';
import { Promotion } from '../../domain/entities/promotion.entity';
import { DiscountType } from '../../domain/value-objects/discount-type';
import { PromotionNotFoundError } from '../errors/promotion-not-found.error';
import { PromotionsFetchError } from '../errors/promotions-fetch.error';
import { PromotionNotEligibleError } from '../../domain/errors/promotion-not-eligible.error';
import type { PromotionActor } from '../promotion-actor';
import type {
  CreatePromotionInput,
  FindPromotionsByBusinessUnitInput,
  PromotionRepository,
  RecordOrderPromotionInput,
  UpdatePromotionInput,
} from '../../domain/repositories/promotion.repository';

const existing = (): Promotion =>
  new Promotion(
    'promo-1',
    'bu-1',
    'Almoço',
    DiscountType.PERCENTAGE,
    Money.fromDecimalString('10.00'),
    Money.fromDecimalString('30.00'),
    new Date('2026-06-01T00:00:00.000Z'),
    new Date('2026-06-30T00:00:00.000Z'),
    true,
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
        input.name ?? base.name,
        input.discountType ?? base.discountType,
        input.discountValue ? Money.fromDecimalString(input.discountValue) : base.discountValue,
        input.minOrderValue ? Money.fromDecimalString(input.minOrderValue) : base.minOrderValue,
        input.startDate ?? base.startDate,
        input.endDate ?? base.endDate,
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

const owner = (businessUnitId: string | null = 'bu-1'): PromotionActor => ({
  role: UserRole.MANAGER,
  businessUnitId,
});
const admin: PromotionActor = { role: UserRole.ADMIN, businessUnitId: null };

describe('UpdatePromotionUseCase', () => {
  let repo: FakePromotionRepository;
  let useCase: UpdatePromotionUseCase;

  beforeEach(() => {
    repo = new FakePromotionRepository();
    useCase = new UpdatePromotionUseCase(repo);
  });

  it('updates an existing promotion with the patched fields', async () => {
    repo.seed(existing());

    const updated = await useCase.execute('promo-1', { name: 'Jantar', isActive: false }, owner());

    expect(repo.updates).toEqual([{ id: 'promo-1', input: { name: 'Jantar', isActive: false } }]);
    expect(updated.name).toBe('Jantar');
    expect(updated.isActive).toBe(false);
  });

  it('lets a global ADMIN update any unit promotion', async () => {
    repo.seed(existing());

    const updated = await useCase.execute('promo-1', { name: 'Jantar' }, admin);

    expect(updated.name).toBe('Jantar');
  });

  it('hides a foreign-unit promotion behind PromotionNotFoundError and never updates', async () => {
    repo.seed(existing());

    await expect(useCase.execute('promo-1', { name: 'x' }, owner('bu-2'))).rejects.toBeInstanceOf(
      PromotionNotFoundError,
    );
    expect(repo.updates).toEqual([]);
  });

  it('wraps a findById failure as PromotionsFetchError, chaining the cause, and never updates', async () => {
    const cause = new Error('db down');
    repo.failFindWith(cause);

    await expect(useCase.execute('promo-1', { name: 'x' }, owner())).rejects.toBeInstanceOf(
      PromotionsFetchError,
    );
    await expect(useCase.execute('promo-1', { name: 'x' }, owner())).rejects.toMatchObject({
      cause,
    });
    expect(repo.updates).toEqual([]);
  });

  it('throws PromotionNotFoundError when the promotion does not exist', async () => {
    repo.seed(null);

    await expect(useCase.execute('missing', { name: 'x' }, owner())).rejects.toBeInstanceOf(
      PromotionNotFoundError,
    );
    expect(repo.updates).toEqual([]);
  });

  it('rejects a patch that makes endDate precede startDate against the effective values', async () => {
    repo.seed(existing());

    // Only endDate is patched; it must be checked against the persisted startDate.
    await expect(
      useCase.execute('promo-1', { endDate: new Date('2026-05-01T00:00:00.000Z') }, owner()),
    ).rejects.toBeInstanceOf(PromotionNotEligibleError);
    expect(repo.updates).toEqual([]);
  });

  it('accepts patching only startDate when it stays before the persisted endDate', async () => {
    repo.seed(existing());

    const updated = await useCase.execute(
      'promo-1',
      { startDate: new Date('2026-06-10T00:00:00.000Z') },
      owner(),
    );

    expect(updated.startDate).toEqual(new Date('2026-06-10T00:00:00.000Z'));
  });
});
