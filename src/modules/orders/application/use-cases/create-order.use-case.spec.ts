import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { CreateOrderUseCase, type CreateOrderCommand } from './create-order.use-case';
import { ORDER_REPOSITORY, type OrderRepository } from '../../domain/repositories/order.repository';
import { OrderChannel } from '../../domain/value-objects/order-channel';
import { Order } from '../../domain/entities/order.entity';
import { AttendantRequiredError } from '../errors/attendant-required.error';

describe('CreateOrderUseCase', () => {
  let useCase: CreateOrderUseCase;
  let create: jest.MockedFunction<OrderRepository['create']>;

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

    const moduleRef = await Test.createTestingModule({
      providers: [
        CreateOrderUseCase,
        { provide: ORDER_REPOSITORY, useValue: { create } satisfies OrderRepository },
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
    );
  });

  it('APP channel: the logged-in user is the customer and there is no attendant', async () => {
    await useCase.execute(command({ orderChannel: OrderChannel.APP }), {
      id: 'u-1',
      isStaff: false,
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 'u-1', attendantId: null }),
    );
  });

  it('TOTEM channel: anonymous, no customer and no attendant', async () => {
    await useCase.execute(command({ orderChannel: OrderChannel.TOTEM }), {
      id: 'u-1',
      isStaff: false,
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: null, attendantId: null }),
    );
  });

  it('COUNTER channel with a staff actor: actor is the attendant, customer comes from the command', async () => {
    await useCase.execute(command({ orderChannel: OrderChannel.COUNTER, customerId: 'c-9' }), {
      id: 'att-1',
      isStaff: true,
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ attendantId: 'att-1', customerId: 'c-9' }),
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
});
