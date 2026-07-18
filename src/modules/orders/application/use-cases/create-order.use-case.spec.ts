import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { Money } from '@shared/domain/value-objects/money';
import { CreateOrderUseCase, type CreateOrderCommand } from './create-order.use-case';
import { ORDER_REPOSITORY, type OrderRepository } from '../../domain/repositories/order.repository';
import { OrderChannel } from '../../domain/value-objects/order-channel';
import { Order } from '../../domain/entities/order.entity';
import { AttendantRequiredError } from '../errors/attendant-required.error';
import { ConflictingCustomerIdentityError } from '../errors/conflicting-customer-identity.error';
import { GuestNameRequiredError } from '../errors/guest-name-required.error';
import { PriceMismatchError } from '../errors/price-mismatch.error';
import { ProductInactiveError } from '../errors/product-inactive.error';
import { ProductUnavailableError } from '../errors/product-unavailable.error';
import { OrderReferenceNotFoundError } from '../../domain/errors/order-reference-not-found.error';
import { ORDER_PRODUCT_LOOKUP, type OrderProductLookup } from '../ports/order-product-lookup.port';
import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '@shared/transaction/transaction-runner.port';
import { AUDIT_LOGGER, type AuditLogger } from '@modules/audit/application/ports/audit-logger.port';
import { AUDIT_ACTIONS } from '@modules/audit/domain/audit-actions';
import {
  STOCK_DEDUCTION,
  type StockDeduction,
} from '@modules/inventory/application/ports/stock-deduction.port';
import { InsufficientStockError } from '@modules/inventory/domain/errors/insufficient-stock.error';
import {
  LOYALTY_ENROLLMENT,
  type LoyaltyEnrollment,
} from '@modules/loyalty/application/ports/loyalty-enrollment.port';
import {
  LOYALTY_REDEMPTION,
  type LoyaltyRedemption,
  type QuoteDiscountInput,
  type RedeemForOrderInput,
} from '@modules/loyalty/application/ports/loyalty-redemption.port';
import { LoyaltyAccount } from '@modules/loyalty/domain/entities/loyalty-account.entity';
import {
  PROMOTION_APPLICATION,
  type AppliedPromotion,
  type ApplyPromotionInput,
  type PromotionApplication,
  type QuotePromotionInput,
} from '@modules/promotions/application/ports/promotion-application.port';
import { PointsRedemptionRequiresCustomerError } from '../errors/points-redemption-requires-customer.error';
import { InsufficientPointsError } from '@modules/loyalty/domain/errors/insufficient-points.error';
import {
  IDEMPOTENCY_STORE,
  type ExistingIdempotencyRecord,
  type IdempotencyScope,
  type IdempotencyStore,
  type RecordIdempotencyInput,
} from '../ports/idempotency-store.port';
import { IdempotencyKeyConflictError } from '../errors/idempotency-key-conflict.error';
import { IdempotencyRaceError } from '../errors/idempotency-race.error';
import type { OrderIdempotency } from './create-order.use-case';

/**
 * In-memory fake of the IdempotencyStore. find returns a seeded record; record stores
 * the input and makes a later find return it, unless raceNext() is armed - then record
 * rejects with IdempotencyRaceError, simulating a concurrent winner.
 */
class FakeIdempotencyStore implements IdempotencyStore {
  private readonly rows = new Map<string, ExistingIdempotencyRecord>();
  readonly recorded: RecordIdempotencyInput[] = [];
  private race = false;

  private keyOf(scope: IdempotencyScope): string {
    return `${scope.userId}|${scope.endpoint}|${scope.key}`;
  }

  seed(scope: IdempotencyScope, record: ExistingIdempotencyRecord): void {
    this.rows.set(this.keyOf(scope), record);
  }

  raceNext(): void {
    this.race = true;
  }

  find(scope: IdempotencyScope): Promise<ExistingIdempotencyRecord | null> {
    return Promise.resolve(this.rows.get(this.keyOf(scope)) ?? null);
  }

  record(input: RecordIdempotencyInput): Promise<void> {
    if (this.race) {
      this.race = false;
      return Promise.reject(new IdempotencyRaceError());
    }
    this.recorded.push(input);
    this.rows.set(this.keyOf(input), { requestHash: input.requestHash, orderId: input.orderId });
    return Promise.resolve();
  }

  deleteExpired(): Promise<number> {
    return Promise.resolve(0);
  }
}

const idem = (overrides: Partial<OrderIdempotency> = {}): OrderIdempotency => ({
  key: 'idem-1',
  userId: 'u-1',
  endpoint: 'POST /orders',
  requestHash: 'hash-1',
  ...overrides,
});

/**
 * Fake of the PROMOTION_APPLICATION port. Holds at most one promotion (MVP stacking) and
 * records the OrderPromotion the apply pass would write, so the order's total and the
 * recorded promo parcel are exercised end-to-end rather than asserted as mock calls.
 * quote and apply return the same AppliedPromotion (deterministic).
 */
class FakePromotionApplication implements PromotionApplication {
  private applied: AppliedPromotion | null = null;
  readonly recorded: { orderId: string; promotionId: string; discount: string }[] = [];

  /** Seed the single promotion this order would receive (null = no promotion). */
  setApplied(applied: AppliedPromotion | null): void {
    this.applied = applied;
  }

  quoteDiscount(_input: QuotePromotionInput): Promise<AppliedPromotion | null> {
    void _input;
    return Promise.resolve(this.applied);
  }

  applyForOrder(input: ApplyPromotionInput): Promise<AppliedPromotion | null> {
    if (this.applied) {
      this.recorded.push({
        orderId: input.orderId,
        promotionId: this.applied.promotionId,
        discount: this.applied.discount,
      });
    }
    return Promise.resolve(this.applied);
  }
}

/**
 * Fake of the two loyalty ports the orders context consumes, backed by an in-memory
 * balance per customer. It applies the real redeem rate and ceiling rule (via the
 * loyalty domain) and really debits points on redeemForOrder, so the order's total
 * and the post-debit balance are exercised end-to-end - not asserted as mock calls.
 * ensureAccount records the enrolled customer; failures are simulated with failNext.
 */
class FakeLoyalty implements LoyaltyRedemption, LoyaltyEnrollment {
  private readonly balanceByCustomer = new Map<string, number>();
  readonly enrolled: string[] = [];
  private enrollmentError: Error | null = null;

  seedBalance(customerId: string, points: number): void {
    this.balanceByCustomer.set(customerId, points);
  }

  balanceOf(customerId: string): number | undefined {
    return this.balanceByCustomer.get(customerId);
  }

  failEnrollmentOnce(error: Error): void {
    this.enrollmentError = error;
  }

  quoteDiscount(input: QuoteDiscountInput): Promise<string> {
    return Promise.resolve(this.resolveDiscount(input));
  }

  redeemForOrder(input: RedeemForOrderInput): Promise<string> {
    const discount = this.resolveDiscount(input);
    this.balanceByCustomer.set(
      input.customerId,
      (this.balanceByCustomer.get(input.customerId) ?? 0) - input.points,
    );
    return Promise.resolve(discount);
  }

  ensureAccount(customerId: string): Promise<void> {
    if (this.enrollmentError) {
      const error = this.enrollmentError;
      this.enrollmentError = null;
      return Promise.reject(error);
    }
    this.enrolled.push(customerId);
    return Promise.resolve();
  }

  /** Mirrors RedeemPointsUseCase: consent/balance/ceiling guard then the deterministic rate. */
  private resolveDiscount(input: QuoteDiscountInput): string {
    const balance = this.balanceByCustomer.get(input.customerId) ?? 0;
    if (!Number.isInteger(input.points) || input.points <= 0 || balance < input.points) {
      throw new InsufficientPointsError(
        `Customer ${input.customerId} cannot redeem ${input.points} points.`,
      );
    }
    const discount = LoyaltyAccount.discountForPoints(input.points);
    if (Money.fromDecimalString(discount).greaterThan(Money.fromDecimalString(input.subtotal))) {
      throw new InsufficientPointsError(
        `Redeeming ${input.points} points exceeds the order subtotal R$${input.subtotal}.`,
      );
    }
    return discount;
  }
}

describe('CreateOrderUseCase', () => {
  const txContext: unknown = Symbol('tx-context');
  let useCase: CreateOrderUseCase;
  let create: jest.MockedFunction<OrderRepository['create']>;
  let findById: jest.MockedFunction<OrderRepository['findById']>;
  let idempotency: FakeIdempotencyStore;
  let resolveLookup: jest.MockedFunction<OrderProductLookup['resolve']>;
  let logAudit: jest.MockedFunction<AuditLogger['log']>;
  let deductForOrder: jest.MockedFunction<StockDeduction['deductForOrder']>;
  let loyalty: FakeLoyalty;
  let promotions: FakePromotionApplication;

  const command = (overrides: Partial<CreateOrderCommand> = {}): CreateOrderCommand => ({
    businessUnitId: 'bu-1',
    orderChannel: OrderChannel.APP,
    orderItems: [{ productId: 'p-1', quantity: 2, unitPrice: '10.00' }],
    ...overrides,
  });

  const persisted = new Order(
    'o-1',
    'bu-1',
    null,
    null,
    null,
    0,
    0,
    Money.zero(),
    null,
    OrderChannel.APP,
    'PENDING',
    new Date(),
    new Date(),
    null,
    [],
  );

  beforeEach(async () => {
    create = jest.fn() as jest.MockedFunction<OrderRepository['create']>;
    create.mockResolvedValue(persisted);

    findById = jest.fn() as jest.MockedFunction<OrderRepository['findById']>;
    idempotency = new FakeIdempotencyStore();

    resolveLookup = jest.fn() as jest.MockedFunction<OrderProductLookup['resolve']>;
    resolveLookup.mockResolvedValue(
      new Map([
        ['p-1', { price: Money.fromDecimalString('10.00'), isActive: true, isAvailable: true }],
      ]),
    );

    logAudit = jest.fn() as jest.MockedFunction<AuditLogger['log']>;
    logAudit.mockResolvedValue(undefined);

    deductForOrder = jest.fn() as jest.MockedFunction<StockDeduction['deductForOrder']>;
    deductForOrder.mockResolvedValue({ lowStock: [] });

    loyalty = new FakeLoyalty();
    promotions = new FakePromotionApplication();

    // Fake unit of work: runs the work immediately, handing it a sentinel tx
    // so tests can assert the same context reaches the repository.
    const transactions: TransactionRunner = { run: (work) => work(txContext) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CreateOrderUseCase,
        { provide: AUDIT_LOGGER, useValue: { log: logAudit } satisfies AuditLogger },
        {
          provide: ORDER_REPOSITORY,
          useValue: {
            create,
            findById,
            findMany: jest.fn() as jest.MockedFunction<OrderRepository['findMany']>,
            updateStatus: jest.fn() as jest.MockedFunction<OrderRepository['updateStatus']>,
          } satisfies OrderRepository,
        },
        {
          provide: ORDER_PRODUCT_LOOKUP,
          useValue: { resolve: resolveLookup } satisfies OrderProductLookup,
        },
        { provide: TRANSACTION_RUNNER, useValue: transactions },
        {
          provide: STOCK_DEDUCTION,
          useValue: { deductForOrder } satisfies StockDeduction,
        },
        { provide: LOYALTY_ENROLLMENT, useValue: loyalty satisfies LoyaltyEnrollment },
        { provide: LOYALTY_REDEMPTION, useValue: loyalty satisfies LoyaltyRedemption },
        { provide: PROMOTION_APPLICATION, useValue: promotions satisfies PromotionApplication },
        { provide: IDEMPOTENCY_STORE, useValue: idempotency satisfies IdempotencyStore },
      ],
    }).compile();

    useCase = moduleRef.get(CreateOrderUseCase);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('computes each subtotal and the total from the items', async () => {
    await useCase.execute(command(), { id: 'u-1', canAttend: false });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        totalAmount: '20.00',
        orderItems: [expect.objectContaining({ subtotal: '20.00' })],
      }),
      txContext,
    );
  });

  it('writes an ORDER_CREATED audit entry for the created order', async () => {
    await useCase.execute(command(), { id: 'u-1', canAttend: false });

    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u-1',
        action: AUDIT_ACTIONS.ORDER_CREATED,
        entity: 'Order',
        entityId: 'o-1',
      }),
    );
  });

  it('APP channel: the logged-in user is the customer and there is no attendant', async () => {
    await useCase.execute(command({ orderChannel: OrderChannel.APP }), {
      id: 'u-1',
      canAttend: false,
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 'u-1', attendantId: null }),
      txContext,
    );
  });

  it('TOTEM channel: anonymous, no customer and no attendant', async () => {
    await useCase.execute(command({ orderChannel: OrderChannel.TOTEM, customerName: 'Maria' }), {
      id: 'u-1',
      canAttend: false,
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: null, attendantId: null }),
      txContext,
    );
  });

  it('COUNTER channel with a staff actor: actor is the attendant, customer comes from the command', async () => {
    await useCase.execute(command({ orderChannel: OrderChannel.COUNTER, customerId: 'c-9' }), {
      id: 'att-1',
      canAttend: true,
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ attendantId: 'att-1', customerId: 'c-9' }),
      txContext,
    );
  });

  it('COUNTER channel without a staff actor: rejects and never persists', async () => {
    await expect(
      useCase.execute(command({ orderChannel: OrderChannel.COUNTER }), {
        id: 'u-1',
        canAttend: false,
      }),
    ).rejects.toBeInstanceOf(AttendantRequiredError);

    expect(create).not.toHaveBeenCalled();
  });

  describe('guest customer name', () => {
    const guest = { id: 'att-1', canAttend: true };

    it('TOTEM without a name rejects and never persists', async () => {
      await expect(
        useCase.execute(command({ orderChannel: OrderChannel.TOTEM }), {
          id: 'u-1',
          canAttend: false,
        }),
      ).rejects.toBeInstanceOf(GuestNameRequiredError);

      expect(create).not.toHaveBeenCalled();
    });

    it('TOTEM with a name persists it', async () => {
      await useCase.execute(command({ orderChannel: OrderChannel.TOTEM, customerName: 'Maria' }), {
        id: 'u-1',
        canAttend: false,
      });

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ customerName: 'Maria', customerId: null }),
        txContext,
      );
    });

    it('TOTEM with a whitespace-only name is treated as absent and rejects', async () => {
      await expect(
        useCase.execute(command({ orderChannel: OrderChannel.TOTEM, customerName: '   ' }), {
          id: 'u-1',
          canAttend: false,
        }),
      ).rejects.toBeInstanceOf(GuestNameRequiredError);

      expect(create).not.toHaveBeenCalled();
    });

    it('TOTEM with a zero-width-space-only name is treated as absent and rejects', async () => {
      // U+200B (zero-width space) survives JS trim() but not the \p{Cf} strip.
      const zeroWidthOnly = '\u200B\u200B';

      await expect(
        useCase.execute(
          command({ orderChannel: OrderChannel.TOTEM, customerName: zeroWidthOnly }),
          { id: 'u-1', canAttend: false },
        ),
      ).rejects.toBeInstanceOf(GuestNameRequiredError);

      expect(create).not.toHaveBeenCalled();
    });

    it('TOTEM with a punctuation-only name is treated as absent and rejects', async () => {
      await expect(
        useCase.execute(command({ orderChannel: OrderChannel.TOTEM, customerName: '...---!!!' }), {
          id: 'u-1',
          canAttend: false,
        }),
      ).rejects.toBeInstanceOf(GuestNameRequiredError);

      expect(create).not.toHaveBeenCalled();
    });

    it.each(['José', 'Ana Sofía'])(
      'TOTEM accepts a legitimate accented name %s (regression guard)',
      async (accentedName) => {
        await useCase.execute(
          command({ orderChannel: OrderChannel.TOTEM, customerName: accentedName }),
          { id: 'u-1', canAttend: false },
        );

        expect(create).toHaveBeenCalledWith(
          expect.objectContaining({ customerName: accentedName, customerId: null }),
          txContext,
        );
      },
    );

    it.each([OrderChannel.APP, OrderChannel.WEB])(
      '%s rejects a customerName: the account is the identity',
      async (orderChannel) => {
        await expect(
          useCase.execute(command({ orderChannel, customerName: 'Maria' }), {
            id: 'u-1',
            canAttend: false,
          }),
        ).rejects.toBeInstanceOf(ConflictingCustomerIdentityError);

        expect(create).not.toHaveBeenCalled();
      },
    );

    it.each([OrderChannel.COUNTER, OrderChannel.PICKUP])(
      '%s with a customerId only leaves customerName null',
      async (orderChannel) => {
        await useCase.execute(command({ orderChannel, customerId: 'c-9' }), guest);

        expect(create).toHaveBeenCalledWith(
          expect.objectContaining({ customerId: 'c-9', customerName: null }),
          txContext,
        );
      },
    );

    it.each([OrderChannel.COUNTER, OrderChannel.PICKUP])(
      '%s with a name only persists the guest name',
      async (orderChannel) => {
        await useCase.execute(command({ orderChannel, customerName: 'Maria' }), guest);

        expect(create).toHaveBeenCalledWith(
          expect.objectContaining({ customerId: null, customerName: 'Maria' }),
          txContext,
        );
      },
    );

    it.each([OrderChannel.COUNTER, OrderChannel.PICKUP])(
      '%s with both a customerId and a name rejects',
      async (orderChannel) => {
        await expect(
          useCase.execute(
            command({ orderChannel, customerId: 'c-9', customerName: 'Maria' }),
            guest,
          ),
        ).rejects.toBeInstanceOf(ConflictingCustomerIdentityError);

        expect(create).not.toHaveBeenCalled();
      },
    );

    it.each([OrderChannel.COUNTER, OrderChannel.PICKUP])(
      '%s with neither a customerId nor a name rejects',
      async (orderChannel) => {
        await expect(useCase.execute(command({ orderChannel }), guest)).rejects.toBeInstanceOf(
          GuestNameRequiredError,
        );

        expect(create).not.toHaveBeenCalled();
      },
    );

    it('trims a padded name before persisting it', async () => {
      await useCase.execute(
        command({ orderChannel: OrderChannel.COUNTER, customerName: '  Maria  ' }),
        guest,
      );

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ customerName: 'Maria' }),
        txContext,
      );
    });
  });

  describe('orderable products validation', () => {
    it('rejects with PriceMismatchError when unitPrice in body diverges from the authoritative price', async () => {
      resolveLookup.mockResolvedValue(
        new Map([
          ['p-1', { price: Money.fromDecimalString('11.00'), isActive: true, isAvailable: true }],
        ]),
      );

      await expect(
        useCase.execute(
          command({ orderItems: [{ productId: 'p-1', quantity: 1, unitPrice: '10.00' }] }),
          { id: 'u-1', canAttend: false },
        ),
      ).rejects.toBeInstanceOf(PriceMismatchError);
      expect(create).not.toHaveBeenCalled();
      expect(logAudit).not.toHaveBeenCalled();
    });

    it('rejects with OrderReferenceNotFoundError when the product is not on this unit menu', async () => {
      resolveLookup.mockResolvedValue(new Map());

      await expect(
        useCase.execute(
          command({ orderItems: [{ productId: 'p-1', quantity: 1, unitPrice: '10.00' }] }),
          { id: 'u-1', canAttend: false },
        ),
      ).rejects.toBeInstanceOf(OrderReferenceNotFoundError);
      expect(create).not.toHaveBeenCalled();
    });

    it('rejects with ProductInactiveError when the product is on the menu but flagged inactive', async () => {
      resolveLookup.mockResolvedValue(
        new Map([
          ['p-1', { price: Money.fromDecimalString('10.00'), isActive: false, isAvailable: true }],
        ]),
      );

      await expect(
        useCase.execute(
          command({ orderItems: [{ productId: 'p-1', quantity: 1, unitPrice: '10.00' }] }),
          { id: 'u-1', canAttend: false },
        ),
      ).rejects.toBeInstanceOf(ProductInactiveError);
      expect(create).not.toHaveBeenCalled();
    });

    it('rejects with ProductUnavailableError when the menu item is currently unavailable', async () => {
      resolveLookup.mockResolvedValue(
        new Map([
          ['p-1', { price: Money.fromDecimalString('10.00'), isActive: true, isAvailable: false }],
        ]),
      );

      await expect(
        useCase.execute(
          command({ orderItems: [{ productId: 'p-1', quantity: 1, unitPrice: '10.00' }] }),
          { id: 'u-1', canAttend: false },
        ),
      ).rejects.toBeInstanceOf(ProductUnavailableError);
      expect(create).not.toHaveBeenCalled();
    });

    it('accepts when unitPrice matches even when the authoritative value is written with extra decimal precision', async () => {
      resolveLookup.mockResolvedValue(
        new Map([
          ['p-1', { price: Money.fromDecimalString('10.00'), isActive: true, isAvailable: true }],
        ]),
      );

      await useCase.execute(
        command({ orderItems: [{ productId: 'p-1', quantity: 1, unitPrice: '10' }] }),
        { id: 'u-1', canAttend: false },
      );

      expect(create).toHaveBeenCalledTimes(1);
    });
  });

  describe('stock deduction (RN-28/29)', () => {
    it('deducts stock for every item inside the same transaction, linked to the order', async () => {
      await useCase.execute(
        command({
          orderItems: [
            { productId: 'p-1', quantity: 2, unitPrice: '10.00' },
            { productId: 'p-1', quantity: 1, unitPrice: '10.00' },
          ],
        }),
        { id: 'u-1', canAttend: false },
      );

      expect(deductForOrder).toHaveBeenCalledWith(
        {
          businessUnitId: 'bu-1',
          orderId: 'o-1',
          actorId: 'u-1',
          items: [
            { productId: 'p-1', quantity: 2 },
            { productId: 'p-1', quantity: 1 },
          ],
        },
        txContext,
      );
    });

    it('rejects with InsufficientStockError and never audits when an item is out of stock', async () => {
      deductForOrder.mockRejectedValue(new InsufficientStockError('not enough'));

      await expect(
        useCase.execute(command(), { id: 'u-1', canAttend: false }),
      ).rejects.toBeInstanceOf(InsufficientStockError);

      // The fake tx runner cannot roll back, but nothing post-commit may run.
      expect(logAudit).not.toHaveBeenCalled();
    });

    it('emits one STOCK_ALERT audit per item left at or below minQuantity (post-commit)', async () => {
      deductForOrder.mockResolvedValue({
        lowStock: [{ productId: 'p-1', quantity: 1, minQuantity: 5 }],
      });

      await useCase.execute(command(), { id: 'u-1', canAttend: false });

      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AUDIT_ACTIONS.STOCK_ALERT,
          entity: 'Inventory',
          entityId: 'p-1',
          metadata: { businessUnitId: 'bu-1', productId: 'p-1', quantity: 1, minQuantity: 5 },
        }),
      );
    });

    it('emits no STOCK_ALERT when every balance stays above the threshold', async () => {
      await useCase.execute(command(), { id: 'u-1', canAttend: false });

      const actions = logAudit.mock.calls.map(([input]) => input.action);
      expect(actions).toEqual([AUDIT_ACTIONS.ORDER_CREATED]);
    });
  });

  describe('loyalty enrollment (RN-30)', () => {
    const persistedWithCustomer = new Order(
      'o-1',
      'bu-1',
      'c-1',
      null,
      null,
      0,
      0,
      Money.zero(),
      null,
      OrderChannel.APP,
      'PENDING',
      new Date(),
      new Date(),
      null,
      [],
    );

    it('ensures a loyalty account post-commit when the order has a customer', async () => {
      create.mockResolvedValue(persistedWithCustomer);

      await useCase.execute(command(), { id: 'c-1', canAttend: false });

      expect(loyalty.enrolled).toEqual(['c-1']);
    });

    it('skips enrollment when the order has no customer (anonymous channel)', async () => {
      await useCase.execute(command({ orderChannel: OrderChannel.TOTEM, customerName: 'Maria' }), {
        id: 'u-1',
        canAttend: false,
      });

      expect(loyalty.enrolled).toEqual([]);
    });

    it('a failing enrollment never breaks the created order (best-effort)', async () => {
      create.mockResolvedValue(persistedWithCustomer);
      loyalty.failEnrollmentOnce(new Error('loyalty db down'));

      const order = await useCase.execute(command(), { id: 'c-1', canAttend: false });

      expect(order).toBe(persistedWithCustomer);
    });
  });

  describe('loyalty redemption', () => {
    it('quotes the discount, persists the discounted total and debits points inside the tx', async () => {
      // Subtotal is 2 * 10.00 = 20.00; 50 points price to a 5.00 discount, total 15.
      loyalty.seedBalance('c-1', 80);

      await useCase.execute(command({ pointsRedeemed: 50 }), { id: 'c-1', canAttend: false });

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ totalAmount: '15.00', pointsRedeemed: 50 }),
        txContext,
      );
      // The points were actually debited (80 - 50), proving redeemForOrder ran.
      expect(loyalty.balanceOf('c-1')).toBe(30);
    });

    it('applies no discount and never touches the redemption port when no points are redeemed', async () => {
      loyalty.seedBalance('c-1', 80);

      await useCase.execute(command({ pointsRedeemed: 0 }), { id: 'c-1', canAttend: false });

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ totalAmount: '20.00' }),
        txContext,
      );
      // Untouched balance: no quote and no debit happened.
      expect(loyalty.balanceOf('c-1')).toBe(80);
    });

    it('rejects with 422 and never opens the tx when points are redeemed without a customer', async () => {
      await expect(
        useCase.execute(
          command({ orderChannel: OrderChannel.TOTEM, customerName: 'Maria', pointsRedeemed: 50 }),
          { id: 'u-1', canAttend: false },
        ),
      ).rejects.toBeInstanceOf(PointsRedemptionRequiresCustomerError);

      expect(create).not.toHaveBeenCalled();
    });

    it('propagates an insufficient-balance error from the quote and never persists', async () => {
      // 10 points on hand, asking for 50: the quote rejects before any insert.
      loyalty.seedBalance('c-1', 10);

      await expect(
        useCase.execute(command({ pointsRedeemed: 50 }), { id: 'c-1', canAttend: false }),
      ).rejects.toBeInstanceOf(InsufficientPointsError);

      expect(create).not.toHaveBeenCalled();
      expect(logAudit).not.toHaveBeenCalled();
    });
  });

  describe('promotions', () => {
    it('applies a promotion discount on the gross subtotal and records the OrderPromotion', async () => {
      // Subtotal 2 * 10.00 = 20.00; promo grants 5.00 -> total 15.00.
      promotions.setApplied({ promotionId: 'promo-1', discount: '5.00' });

      await useCase.execute(command(), { id: 'u-1', canAttend: false });

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ totalAmount: '15.00' }),
        txContext,
      );
      expect(promotions.recorded).toEqual([
        { orderId: 'o-1', promotionId: 'promo-1', discount: '5.00' },
      ]);
    });

    it('does not record an OrderPromotion when no promotion applies', async () => {
      promotions.setApplied(null);

      await useCase.execute(command(), { id: 'u-1', canAttend: false });

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ totalAmount: '20.00' }),
        txContext,
      );
      expect(promotions.recorded).toEqual([]);
    });

    it('composes promo then loyalty: loyalty prices on the net (subtotal - promo) and the total is both', async () => {
      // Subtotal 20.00. Promo 5.00 -> net 15.00. 50 points = 5.00, within net.
      // Final discount 5.00 + 5.00 = 10.00 -> total 10.00.
      promotions.setApplied({ promotionId: 'promo-1', discount: '5.00' });
      loyalty.seedBalance('c-1', 80);

      await useCase.execute(command({ pointsRedeemed: 50 }), { id: 'c-1', canAttend: false });

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ totalAmount: '10.00', pointsRedeemed: 50 }),
        txContext,
      );
      // Only the promo parcel is recorded as an OrderPromotion, not the loyalty parcel.
      expect(promotions.recorded).toEqual([
        { orderId: 'o-1', promotionId: 'promo-1', discount: '5.00' },
      ]);
      expect(loyalty.balanceOf('c-1')).toBe(30);
    });

    it('rejects loyalty redemption that exceeds the net subtotal after the promotion', async () => {
      // Subtotal 20.00. Promo 18.00 -> net 2.00. 50 points = 5.00 > 2.00 net: rejected.
      promotions.setApplied({ promotionId: 'promo-1', discount: '18.00' });
      loyalty.seedBalance('c-1', 80);

      await expect(
        useCase.execute(command({ pointsRedeemed: 50 }), { id: 'c-1', canAttend: false }),
      ).rejects.toBeInstanceOf(InsufficientPointsError);

      expect(create).not.toHaveBeenCalled();
    });
  });

  describe('idempotency', () => {
    it('records the key in the order tx with a 24h TTL when a fresh key is supplied', async () => {
      const before = Date.now();

      await useCase.execute(command(), { id: 'u-1', canAttend: false }, idem());

      expect(create).toHaveBeenCalledTimes(1);
      expect(idempotency.recorded).toHaveLength(1);
      const recorded = idempotency.recorded[0];
      expect(recorded).toMatchObject({
        key: 'idem-1',
        userId: 'u-1',
        endpoint: 'POST /orders',
        requestHash: 'hash-1',
        orderId: 'o-1',
      });
      // expiresAt is ~24h out (allow slack for the test clock).
      const ttlMs = recorded.expiresAt.getTime() - before;
      expect(ttlMs).toBeGreaterThan(23 * 60 * 60 * 1000);
      expect(ttlMs).toBeLessThan(25 * 60 * 60 * 1000);
    });

    it('replays the stored order on a repeat key without creating a new one', async () => {
      idempotency.seed(idem(), { requestHash: 'hash-1', orderId: 'o-1' });
      findById.mockResolvedValue(persisted);

      const order = await useCase.execute(command(), { id: 'u-1', canAttend: false }, idem());

      expect(order).toBe(persisted);
      expect(create).not.toHaveBeenCalled();
      expect(findById).toHaveBeenCalledWith('o-1');
      // No side effects re-run on replay.
      expect(logAudit).not.toHaveBeenCalled();
    });

    it('rejects the same key reused with a different body (409) and never creates', async () => {
      idempotency.seed(idem(), { requestHash: 'hash-1', orderId: 'o-1' });

      await expect(
        useCase.execute(command(), { id: 'u-1', canAttend: false }, idem({ requestHash: 'other' })),
      ).rejects.toBeInstanceOf(IdempotencyKeyConflictError);

      expect(create).not.toHaveBeenCalled();
    });

    it('on a lost race rolls back and replays the concurrent winner', async () => {
      // The winner committed between our fast-path read and our insert: seed its row
      // and arm record() to reject as the unique constraint would.
      idempotency.seed(idem(), { requestHash: 'hash-1', orderId: 'o-1' });
      idempotency.raceNext();
      findById.mockResolvedValue(persisted);

      const order = await useCase.execute(command(), { id: 'u-1', canAttend: false }, idem());

      expect(order).toBe(persisted);
      expect(findById).toHaveBeenCalledWith('o-1');
    });

    it('creates normally and records nothing when no key is supplied', async () => {
      await useCase.execute(command(), { id: 'u-1', canAttend: false });

      expect(create).toHaveBeenCalledTimes(1);
      expect(idempotency.recorded).toHaveLength(0);
    });
  });
});
