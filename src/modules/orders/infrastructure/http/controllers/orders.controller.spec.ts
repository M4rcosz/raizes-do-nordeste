import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { Money } from '@shared/domain/value-objects/money';
import { Test } from '@nestjs/testing';
import { OrdersController } from './orders.controller';
import { CreateOrderUseCase } from '@modules/orders/application/use-cases/create-order.use-case';
import { FindOrderByIdUseCase } from '@modules/orders/application/use-cases/find-order-by-id.use-case';
import { ListOrdersUseCase } from '@modules/orders/application/use-cases/list-orders.use-case';
import { UpdateOrderStatusUseCase } from '@modules/orders/application/use-cases/update-order-status.use-case';
import { Order } from '@modules/orders/domain/entities/order.entity';
import { OrderChannel } from '@modules/orders/domain/value-objects/order-channel';
import { OrderStatus } from '@modules/orders/domain/value-objects/order-status';
import { OrderResponseDto } from '../dto/order-response.dto';
import { PaginatedResponseDto } from '@shared/pagination/paginated-response.dto';
import { UserRole } from '@modules/identity/domain/value-objects/user-role';
import type { JwtPayload } from '@shared/auth/jwt-payload.type';

const buildOrder = (id = 'o-1', status: OrderStatus = OrderStatus.PENDING): Order =>
  new Order(
    id,
    'bu-1',
    'c-1',
    null,
    0,
    0,
    Money.zero(),
    null,
    OrderChannel.APP,
    status,
    new Date('2026-01-01T00:00:00Z'),
    new Date('2026-01-01T00:00:00Z'),
    null,
    [],
  );

const jwt = (sub: string, role: UserRole): JwtPayload => ({
  sub,
  username: 'u',
  role,
  iat: 0,
  exp: 0,
});

describe('OrdersController', () => {
  let controller: OrdersController;
  let createOrder: jest.Mocked<CreateOrderUseCase>;
  let findOrderById: jest.Mocked<FindOrderByIdUseCase>;
  let listOrders: jest.Mocked<ListOrdersUseCase>;
  let updateOrderStatus: jest.Mocked<UpdateOrderStatusUseCase>;

  beforeAll(async () => {
    createOrder = { execute: jest.fn() } as unknown as jest.Mocked<CreateOrderUseCase>;
    findOrderById = { execute: jest.fn() } as unknown as jest.Mocked<FindOrderByIdUseCase>;
    listOrders = { execute: jest.fn() } as unknown as jest.Mocked<ListOrdersUseCase>;
    updateOrderStatus = { execute: jest.fn() } as unknown as jest.Mocked<UpdateOrderStatusUseCase>;

    const moduleRef = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [
        { provide: CreateOrderUseCase, useValue: createOrder },
        { provide: FindOrderByIdUseCase, useValue: findOrderById },
        { provide: ListOrdersUseCase, useValue: listOrders },
        { provide: UpdateOrderStatusUseCase, useValue: updateOrderStatus },
      ],
    }).compile();

    controller = moduleRef.get(OrdersController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('list', () => {
    it('clamps the limit, forwards filters and returns a paginated DTO envelope', async () => {
      listOrders.execute.mockResolvedValue({
        data: [buildOrder()],
        meta: { limit: 100, hasMore: false, nextCursor: null },
      });

      const response = await controller.list({ limit: 99999, orderChannel: OrderChannel.APP });

      expect(listOrders.execute).toHaveBeenCalledWith({
        cursor: undefined,
        limit: 100,
        filters: {
          businessUnitId: undefined,
          orderChannel: OrderChannel.APP,
          orderStatus: undefined,
        },
      });
      expect(response).toBeInstanceOf(PaginatedResponseDto);
      expect(response.data[0]).toBeInstanceOf(OrderResponseDto);
    });
  });

  describe('findById', () => {
    it('forwards the requester and maps the order to its DTO', async () => {
      findOrderById.execute.mockResolvedValue(buildOrder('o-42'));

      const response = await controller.findById({ id: 'o-42' }, jwt('c-1', UserRole.CUSTOMER));

      expect(findOrderById.execute).toHaveBeenCalledWith('o-42', {
        id: 'c-1',
        role: UserRole.CUSTOMER,
      });
      expect(response).toBeInstanceOf(OrderResponseDto);
      expect(response.id).toBe('o-42');
    });
  });

  describe('changeStatus', () => {
    it('delegates to the use-case with the actor id and maps the result', async () => {
      updateOrderStatus.execute.mockResolvedValue(buildOrder('o-7', OrderStatus.CONFIRMED));

      const response = await controller.changeStatus(
        { id: 'o-7' },
        { orderStatus: OrderStatus.CONFIRMED },
        jwt('staff-1', UserRole.MANAGER),
      );

      expect(updateOrderStatus.execute).toHaveBeenCalledWith(
        { orderId: 'o-7', orderStatus: OrderStatus.CONFIRMED },
        'staff-1',
      );
      expect(response).toBeInstanceOf(OrderResponseDto);
      expect(response.orderStatus).toBe(OrderStatus.CONFIRMED);
    });
  });

  describe('create', () => {
    const body = {
      businessUnitId: 'bu-1',
      orderChannel: OrderChannel.APP,
      orderItems: [{ productId: 'p-1', quantity: 1, unitPrice: '12.50' }],
    };

    it('maps the JWT to an actor and maps the created order', async () => {
      createOrder.execute.mockResolvedValue(buildOrder('o-9'));

      const response = await controller.create(body, jwt('c-1', UserRole.CUSTOMER));

      expect(createOrder.execute).toHaveBeenCalledWith(body, { id: 'c-1', canAttend: false });
      expect(response).toBeInstanceOf(OrderResponseDto);
      expect(response.id).toBe('o-9');
    });

    it.each<[UserRole, boolean]>([
      [UserRole.CUSTOMER, false],
      [UserRole.KITCHEN, false],
      [UserRole.ATTENDANT, true],
      [UserRole.MANAGER, true],
      [UserRole.ADMIN, true],
    ])('role %s derives canAttend=%s', async (role, canAttend) => {
      createOrder.execute.mockResolvedValue(buildOrder('o-9'));

      await controller.create(body, jwt('u-1', role));

      expect(createOrder.execute).toHaveBeenCalledWith(body, { id: 'u-1', canAttend });
    });
  });
});
