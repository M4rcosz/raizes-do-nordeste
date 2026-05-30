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

describe('CreateOrderUseCase', () => {
  const txContext: unknown = Symbol('tx-context');
  let useCase: CreateOrderUseCase;
  let create: jest.MockedFunction<OrderRepository['create']>;
  let resolveLookup: jest.MockedFunction<OrderProductLookup['resolve']>;

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

    // Fake unit of work: runs the work immediately, handing it a sentinel tx
    // so tests can assert the same context reaches the repository.
    const transactions: TransactionRunner = { run: (work) => work(txContext) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CreateOrderUseCase,
        { provide: ORDER_REPOSITORY, useValue: { create } satisfies OrderRepository },
        {
          provide: ORDER_PRODUCT_LOOKUP,
          useValue: { resolve: resolveLookup } satisfies OrderProductLookup,
        },
        { provide: TRANSACTION_RUNNER, useValue: transactions },
      ],
    }).compile();

    useCase = moduleRef.get(CreateOrderUseCase);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('computes each subtotal and the total from the items', async () => {
    await useCase.execute(command(), { id: 'u-1', isStaff: false });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        totalAmount: '20',
        orderItems: [expect.objectContaining({ subtotal: '20' })],
      }),
      txContext,
    );
  });

  it('APP channel: the logged-in user is the customer and there is no attendant', async () => {
    await useCase.execute(command({ orderChannel: OrderChannel.APP }), {
      id: 'u-1',
      isStaff: false,
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 'u-1', attendantId: null }),
      txContext,
    );
  });

  it('TOTEM channel: anonymous, no customer and no attendant', async () => {
    await useCase.execute(command({ orderChannel: OrderChannel.TOTEM }), {
      id: 'u-1',
      isStaff: false,
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: null, attendantId: null }),
      txContext,
    );
  });

  it('COUNTER channel with a staff actor: actor is the attendant, customer comes from the command', async () => {
    await useCase.execute(command({ orderChannel: OrderChannel.COUNTER, customerId: 'c-9' }), {
      id: 'att-1',
      isStaff: true,
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
        isStaff: false,
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
          { id: 'u-1', isStaff: false },
        ),
      ).rejects.toBeInstanceOf(PriceMismatchError);
      expect(create).not.toHaveBeenCalled();
    });

    it('rejects with OrderReferenceNotFoundError when the product is not on this unit menu', async () => {
      resolveLookup.mockResolvedValue(new Map());

      await expect(
        useCase.execute(
          command({ orderItems: [{ productId: 'p-1', quantity: 1, unitPrice: '10.00' }] }),
          { id: 'u-1', isStaff: false },
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
          { id: 'u-1', isStaff: false },
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
          { id: 'u-1', isStaff: false },
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
        { id: 'u-1', isStaff: false },
      );

      expect(create).toHaveBeenCalledTimes(1);
    });
  });
});
