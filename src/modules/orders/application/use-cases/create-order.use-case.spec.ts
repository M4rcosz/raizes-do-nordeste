import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import Big from 'big.js';
import { CreateOrderUseCase, type CreateOrderCommand } from './create-order.use-case';
import { ORDER_REPOSITORY, type OrderRepository } from '../../domain/repositories/order.repository';
import { OrderChannel } from '../../domain/value-objects/order-channel';
import { Order } from '../../domain/entities/order.entity';
import { AttendantRequiredError } from '../errors/attendant-required.error';
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

describe('CreateOrderUseCase', () => {
  const txContext: unknown = Symbol('tx-context');
  let useCase: CreateOrderUseCase;
  let create: jest.MockedFunction<OrderRepository['create']>;
  let resolveLookup: jest.MockedFunction<OrderProductLookup['resolve']>;
  let logAudit: jest.MockedFunction<AuditLogger['log']>;
  let deductForOrder: jest.MockedFunction<StockDeduction['deductForOrder']>;
  let ensureAccount: jest.MockedFunction<LoyaltyEnrollment['ensureAccount']>;

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
    0,
    0,
    new Big(0),
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

    resolveLookup = jest.fn() as jest.MockedFunction<OrderProductLookup['resolve']>;
    resolveLookup.mockResolvedValue(
      new Map([['p-1', { price: new Big('10.00'), isActive: true, isAvailable: true }]]),
    );

    logAudit = jest.fn() as jest.MockedFunction<AuditLogger['log']>;
    logAudit.mockResolvedValue(undefined);

    deductForOrder = jest.fn() as jest.MockedFunction<StockDeduction['deductForOrder']>;
    deductForOrder.mockResolvedValue({ lowStock: [] });

    ensureAccount = jest.fn() as jest.MockedFunction<LoyaltyEnrollment['ensureAccount']>;
    ensureAccount.mockResolvedValue(undefined);

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
            findById: jest.fn() as jest.MockedFunction<OrderRepository['findById']>,
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
        {
          provide: LOYALTY_ENROLLMENT,
          useValue: { ensureAccount } satisfies LoyaltyEnrollment,
        },
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
        totalAmount: '20',
        orderItems: [expect.objectContaining({ subtotal: '20' })],
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
    await useCase.execute(command({ orderChannel: OrderChannel.TOTEM }), {
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

  describe('orderable products validation', () => {
    it('rejects with PriceMismatchError when unitPrice in body diverges from the authoritative price', async () => {
      resolveLookup.mockResolvedValue(
        new Map([['p-1', { price: new Big('11.00'), isActive: true, isAvailable: true }]]),
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
        new Map([['p-1', { price: new Big('10.00'), isActive: false, isAvailable: true }]]),
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
        new Map([['p-1', { price: new Big('10.00'), isActive: true, isAvailable: false }]]),
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
        new Map([['p-1', { price: new Big('10.00'), isActive: true, isAvailable: true }]]),
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
      0,
      0,
      new Big(0),
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

      expect(ensureAccount).toHaveBeenCalledWith('c-1');
    });

    it('skips enrollment when the order has no customer (anonymous channel)', async () => {
      await useCase.execute(command({ orderChannel: OrderChannel.TOTEM }), {
        id: 'u-1',
        canAttend: false,
      });

      expect(ensureAccount).not.toHaveBeenCalled();
    });

    it('a failing enrollment never breaks the created order (best-effort)', async () => {
      create.mockResolvedValue(persistedWithCustomer);
      ensureAccount.mockRejectedValue(new Error('loyalty db down'));

      const order = await useCase.execute(command(), { id: 'c-1', canAttend: false });

      expect(order).toBe(persistedWithCustomer);
    });
  });
});
