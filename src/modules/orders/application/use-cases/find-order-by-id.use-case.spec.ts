import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Money } from '@shared/domain/value-objects/money';
import { FindOrderByIdUseCase } from './find-order-by-id.use-case';
import { OrderNotFoundError } from '../errors/order-not-found.error';
import type { OrderRepository } from '../../domain/repositories/order.repository';
import { Order } from '../../domain/entities/order.entity';
import { OrderChannel } from '../../domain/value-objects/order-channel';
import { OrderStatus } from '../../domain/value-objects/order-status';
import { UserRole } from '@modules/identity/domain/value-objects/user-role';

const makeOrder = (customerId: string | null): Order =>
  new Order(
    'o-1',
    'bu-1',
    customerId,
    null,
    0,
    0,
    Money.zero(),
    null,
    OrderChannel.APP,
    OrderStatus.PENDING,
    new Date(),
    new Date(),
    null,
    [],
  );

describe('FindOrderByIdUseCase', () => {
  let findById: jest.MockedFunction<OrderRepository['findById']>;
  let useCase: FindOrderByIdUseCase;

  beforeEach(() => {
    findById = jest.fn() as jest.MockedFunction<OrderRepository['findById']>;
    const repo = {
      create: jest.fn(),
      findById,
      findMany: jest.fn(),
      updateStatus: jest.fn(),
    } as unknown as OrderRepository;
    useCase = new FindOrderByIdUseCase(repo);
  });

  it('returns the order to a staff member regardless of owner', async () => {
    findById.mockResolvedValue(makeOrder('someone-else'));

    const order = await useCase.execute('o-1', { id: 'staff-1', role: UserRole.MANAGER });

    expect(order.id).toBe('o-1');
  });

  it('returns the order to the customer that owns it', async () => {
    findById.mockResolvedValue(makeOrder('c-1'));

    const order = await useCase.execute('o-1', { id: 'c-1', role: UserRole.CUSTOMER });

    expect(order.customerId).toBe('c-1');
  });

  it('throws OrderNotFoundError when the order does not exist', async () => {
    findById.mockResolvedValue(null);

    await expect(
      useCase.execute('o-1', { id: 'staff-1', role: UserRole.MANAGER }),
    ).rejects.toBeInstanceOf(OrderNotFoundError);
  });

  it('hides another customer order behind the same 404', async () => {
    findById.mockResolvedValue(makeOrder('other-customer'));

    await expect(
      useCase.execute('o-1', { id: 'c-1', role: UserRole.CUSTOMER }),
    ).rejects.toBeInstanceOf(OrderNotFoundError);
  });
});
