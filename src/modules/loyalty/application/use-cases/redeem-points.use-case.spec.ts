import { beforeEach, describe, expect, it } from '@jest/globals';
import { RedeemPointsUseCase } from './redeem-points.use-case';
import type {
  EarnPointsInput,
  LoyaltyRepository,
  RedeemPointsInput,
} from '../../domain/repositories/loyalty.repository';
import { LoyaltyAccount } from '../../domain/entities/loyalty-account.entity';
import { InsufficientPointsError } from '../../domain/errors/insufficient-points.error';
import { PointsRedemptionConflictError } from '../errors/points-redemption-conflict.error';
import type { TransactionContext } from '@shared/transaction/transaction-runner.port';

const TX = Symbol('tx');

/**
 * In-memory LoyaltyRepository keyed by customerId. redeem() really decrements the
 * stored balance so the tests exercise the debit, and it mirrors the prisma repo's
 * optimistic guard: a conditional decrement that throws CONFLICT (never goes
 * negative) when totalPoints < points. A second REDEEM for the same orderId also
 * conflicts, matching the unique-per-order rule.
 */
class FakeLoyaltyRepository implements LoyaltyRepository {
  private readonly byCustomerId = new Map<string, LoyaltyAccount>();
  private readonly redeemedOrderIds = new Set<string>();

  seed(account: LoyaltyAccount): void {
    this.byCustomerId.set(account.customerId, account);
  }

  /** Test helper: current balance for assertions on the debit. */
  balanceOf(customerId: string): number | null {
    return this.byCustomerId.get(customerId)?.totalPoints ?? null;
  }

  findByCustomerId(customerId: string): Promise<LoyaltyAccount | null> {
    return Promise.resolve(this.byCustomerId.get(customerId) ?? null);
  }

  createIfAbsent(customerId: string): Promise<void> {
    if (!this.byCustomerId.has(customerId)) {
      const now = new Date();
      this.byCustomerId.set(
        customerId,
        new LoyaltyAccount(`la-${customerId}`, customerId, 0, false, null, null, now, now),
      );
    }
    return Promise.resolve();
  }

  earn(input: EarnPointsInput): Promise<void> {
    const account = this.requireAccount(input.loyaltyAccountId);
    this.replace(account, account.totalPoints + input.points);
    return Promise.resolve();
  }

  redeem(input: RedeemPointsInput, _tx: TransactionContext): Promise<void> {
    void _tx;
    if (this.redeemedOrderIds.has(input.orderId)) {
      throw new PointsRedemptionConflictError(`Order ${input.orderId} already has a redemption.`);
    }
    const account = this.requireAccount(input.loyaltyAccountId);
    // Conditional decrement: the guard the prisma repo enforces in SQL.
    if (account.totalPoints < input.points) {
      throw new PointsRedemptionConflictError(
        `Insufficient points to redeem ${input.points} for account ${input.loyaltyAccountId} (concurrent debit).`,
      );
    }
    this.replace(account, account.totalPoints - input.points);
    this.redeemedOrderIds.add(input.orderId);
    return Promise.resolve();
  }

  private requireAccount(loyaltyAccountId: string): LoyaltyAccount {
    for (const account of this.byCustomerId.values()) {
      if (account.id === loyaltyAccountId) {
        return account;
      }
    }
    throw new Error(`Fake has no account ${loyaltyAccountId}`);
  }

  private replace(account: LoyaltyAccount, totalPoints: number): void {
    this.byCustomerId.set(
      account.customerId,
      new LoyaltyAccount(
        account.id,
        account.customerId,
        totalPoints,
        account.consentGiven,
        account.consentDate,
        account.consentRevokedAt,
        account.createdAt,
        new Date(),
      ),
    );
  }
}

const account = (consentGiven: boolean, totalPoints: number): LoyaltyAccount =>
  new LoyaltyAccount('la-1', 'c-1', totalPoints, consentGiven, null, null, new Date(), new Date());

describe('RedeemPointsUseCase', () => {
  let repo: FakeLoyaltyRepository;
  let useCase: RedeemPointsUseCase;

  beforeEach(() => {
    repo = new FakeLoyaltyRepository();
    useCase = new RedeemPointsUseCase(repo);
  });

  describe('redeemForOrder', () => {
    it('debits the points from the stored balance and returns the discount when eligible', async () => {
      repo.seed(account(true, 100));

      const discount = await useCase.redeemForOrder(
        { customerId: 'c-1', orderId: 'o-1', points: 100, subtotal: '50.00' },
        TX,
      );

      expect(discount).toBe('10.00');
      expect(repo.balanceOf('c-1')).toBe(0);
    });

    it('leaves the remaining balance intact after a partial redemption', async () => {
      repo.seed(account(true, 100));

      await useCase.redeemForOrder(
        { customerId: 'c-1', orderId: 'o-1', points: 40, subtotal: '50.00' },
        TX,
      );

      expect(repo.balanceOf('c-1')).toBe(60);
    });

    it('rejects with InsufficientPointsError and never debits when the balance is too low', async () => {
      repo.seed(account(true, 40));

      await expect(
        useCase.redeemForOrder(
          { customerId: 'c-1', orderId: 'o-1', points: 50, subtotal: '50.00' },
          TX,
        ),
      ).rejects.toBeInstanceOf(InsufficientPointsError);
      expect(repo.balanceOf('c-1')).toBe(40);
    });

    it('permite resgatar exatamente o saldo total e zera a conta', async () => {
      repo.seed(account(true, 50));

      const discount = await useCase.redeemForOrder(
        { customerId: 'c-1', orderId: 'o-1', points: 50, subtotal: '50.00' },
        TX,
      );

      expect(discount).toBe('5.00');
      expect(repo.balanceOf('c-1')).toBe(0);
    });

    it('rejeita 1 ponto acima do saldo', async () => {
      repo.seed(account(true, 50));

      await expect(
        useCase.redeemForOrder(
          { customerId: 'c-1', orderId: 'o-1', points: 51, subtotal: '50.00' },
          TX,
        ),
      ).rejects.toBeInstanceOf(InsufficientPointsError);
      expect(repo.balanceOf('c-1')).toBe(50);
    });

    it('rejects without consent (LGPD gate)', async () => {
      repo.seed(account(false, 100));

      await expect(
        useCase.redeemForOrder(
          { customerId: 'c-1', orderId: 'o-1', points: 50, subtotal: '50.00' },
          TX,
        ),
      ).rejects.toBeInstanceOf(InsufficientPointsError);
      expect(repo.balanceOf('c-1')).toBe(100);
    });

    it('rejects when the customer has no account', async () => {
      await expect(
        useCase.redeemForOrder(
          { customerId: 'c-1', orderId: 'o-1', points: 50, subtotal: '50.00' },
          TX,
        ),
      ).rejects.toBeInstanceOf(InsufficientPointsError);
    });

    it('rejects when the converted discount exceeds the order subtotal (ceiling)', async () => {
      repo.seed(account(true, 1000));

      await expect(
        useCase.redeemForOrder(
          // 1000 points = R$100.00 > R$50.00 subtotal
          { customerId: 'c-1', orderId: 'o-1', points: 1000, subtotal: '50.00' },
          TX,
        ),
      ).rejects.toBeInstanceOf(InsufficientPointsError);
      expect(repo.balanceOf('c-1')).toBe(1000);
    });

    it('propagates a repository conflict (duplicate redemption for the order) without swallowing it', async () => {
      repo.seed(account(true, 100));
      await useCase.redeemForOrder(
        { customerId: 'c-1', orderId: 'o-1', points: 40, subtotal: '50.00' },
        TX,
      );

      // A second debit keyed to the same order is the optimistic CONFLICT.
      await expect(
        useCase.redeemForOrder(
          { customerId: 'c-1', orderId: 'o-1', points: 40, subtotal: '50.00' },
          TX,
        ),
      ).rejects.toBeInstanceOf(PointsRedemptionConflictError);
    });
  });

  describe('quoteDiscount', () => {
    it('prices the redemption without writing', async () => {
      repo.seed(account(true, 100));

      const discount = await useCase.quoteDiscount(
        { customerId: 'c-1', points: 100, subtotal: '50.00' },
        TX,
      );

      expect(discount).toBe('10.00');
      expect(repo.balanceOf('c-1')).toBe(100);
    });

    it('rejects an ineligible redemption with InsufficientPointsError', async () => {
      repo.seed(account(true, 10));

      await expect(
        useCase.quoteDiscount({ customerId: 'c-1', points: 50, subtotal: '50.00' }, TX),
      ).rejects.toBeInstanceOf(InsufficientPointsError);
    });
  });
});
