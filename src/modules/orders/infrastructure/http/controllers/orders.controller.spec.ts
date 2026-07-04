import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { Money } from '@shared/domain/value-objects/money';
import { Test } from '@nestjs/testing';
import { OrdersController } from './orders.controller';
import { CreateOrderUseCase } from '@modules/orders/application/use-cases/create-order.use-case';
import { CancelOrderUseCase } from '@modules/orders/application/use-cases/cancel-order.use-case';
import { FindOrderByIdUseCase } from '@modules/orders/application/use-cases/find-order-by-id.use-case';
import { ListMyOrdersUseCase } from '@modules/orders/application/use-cases/list-my-orders.use-case';
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
  businessUnitIds: ['bu-1'],
  iat: 0,
  exp: 0,
});

describe('OrdersController', () => {
  let controller: OrdersController;
  let createOrder: jest.Mocked<CreateOrderUseCase>;
  let cancelOrder: jest.Mocked<CancelOrderUseCase>;
  let findOrderById: jest.Mocked<FindOrderByIdUseCase>;
  let listMyOrders: jest.Mocked<ListMyOrdersUseCase>;
  let listOrders: jest.Mocked<ListOrdersUseCase>;
  let updateOrderStatus: jest.Mocked<UpdateOrderStatusUseCase>;

  beforeAll(async () => {
    createOrder = { execute: jest.fn() } as unknown as jest.Mocked<CreateOrderUseCase>;
    cancelOrder = { execute: jest.fn() } as unknown as jest.Mocked<CancelOrderUseCase>;
    findOrderById = { execute: jest.fn() } as unknown as jest.Mocked<FindOrderByIdUseCase>;
    listMyOrders = { execute: jest.fn() } as unknown as jest.Mocked<ListMyOrdersUseCase>;
    listOrders = { execute: jest.fn() } as unknown as jest.Mocked<ListOrdersUseCase>;
    updateOrderStatus = { execute: jest.fn() } as unknown as jest.Mocked<UpdateOrderStatusUseCase>;

    const moduleRef = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [
        { provide: CreateOrderUseCase, useValue: createOrder },
        { provide: CancelOrderUseCase, useValue: cancelOrder },
        { provide: FindOrderByIdUseCase, useValue: findOrderById },
        { provide: ListMyOrdersUseCase, useValue: listMyOrders },
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

      const response = await controller.list(
        { limit: 99999, orderChannel: OrderChannel.APP },
        jwt('staff-1', UserRole.MANAGER),
      );

      expect(listOrders.execute).toHaveBeenCalledWith({
        cursor: undefined,
        limit: 100,
        filters: {
          businessUnitId: undefined,
          orderChannel: OrderChannel.APP,
          orderStatus: undefined,
        },
        actor: { id: 'staff-1', role: UserRole.MANAGER, businessUnitIds: ['bu-1'] },
      });
      expect(response).toBeInstanceOf(PaginatedResponseDto);
      expect(response.data[0]).toBeInstanceOf(OrderResponseDto);
    });
  });

  describe('listMine', () => {
    it('scopes the listing to the caller sub, forwards filters and clamps the limit', async () => {
      listMyOrders.execute.mockResolvedValue({
        data: [buildOrder()],
        meta: { limit: 100, hasMore: false, nextCursor: null },
      });

      const response = await controller.listMine(
        { limit: 99999, orderStatus: OrderStatus.PENDING },
        jwt('c-1', UserRole.CUSTOMER),
      );

      expect(listMyOrders.execute).toHaveBeenCalledWith({
        customerId: 'c-1',
        filters: { orderChannel: undefined, orderStatus: OrderStatus.PENDING },
        cursor: undefined,
        limit: 100,
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
        businessUnitIds: ['bu-1'],
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
        undefined,
        { id: 'staff-1', role: UserRole.MANAGER, businessUnitIds: ['bu-1'] },
      );
      expect(response).toBeInstanceOf(OrderResponseDto);
      expect(response.orderStatus).toBe(OrderStatus.CONFIRMED);
    });
  });

  describe('cancel', () => {
    it('forwards the order id and actor and maps the cancelled order', async () => {
      cancelOrder.execute.mockResolvedValue(buildOrder('o-3', OrderStatus.CANCELLED));

      const response = await controller.cancel({ id: 'o-3' }, jwt('staff-1', UserRole.MANAGER));

      expect(cancelOrder.execute).toHaveBeenCalledWith('o-3', {
        id: 'staff-1',
        role: UserRole.MANAGER,
        businessUnitIds: ['bu-1'],
      });
      expect(response).toBeInstanceOf(OrderResponseDto);
      expect(response.orderStatus).toBe(OrderStatus.CANCELLED);
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

      expect(createOrder.execute).toHaveBeenCalledWith(
        body,
        { id: 'c-1', canAttend: false },
        undefined,
      );
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

      expect(createOrder.execute).toHaveBeenCalledWith(body, { id: 'u-1', canAttend }, undefined);
    });

    it('forwards an Idempotency-Key as an envelope with the user id and a body hash', async () => {
      createOrder.execute.mockResolvedValue(buildOrder('o-9'));

      await controller.create(body, jwt('c-1', UserRole.CUSTOMER), '  my-key  ');

      const idempotencyArg = createOrder.execute.mock.calls[0][2];
      expect(idempotencyArg).toMatchObject({
        key: 'my-key', // trimmed
        userId: 'c-1',
        endpoint: 'POST /orders',
      });
      expect(idempotencyArg?.requestHash).toMatch(/^[a-f0-9]{64}$/); // sha256 hex
    });

    it('ignores a blank Idempotency-Key (idempotency disabled)', async () => {
      createOrder.execute.mockResolvedValue(buildOrder('o-9'));

      await controller.create(body, jwt('c-1', UserRole.CUSTOMER), '   ');

      expect(createOrder.execute).toHaveBeenCalledWith(
        body,
        { id: 'c-1', canAttend: false },
        undefined,
      );
    });
  });
});
