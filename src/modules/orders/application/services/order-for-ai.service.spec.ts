import { beforeEach, describe, expect, it } from '@jest/globals';
import { UserRole } from '@modules/identity/domain/value-objects/user-role';
import { Money } from '@shared/domain/value-objects/money';
import { Order } from '@modules/orders/domain/entities/order.entity';
import { OrderItem } from '@modules/orders/domain/entities/order-item.entity';
import { OrderChannel } from '@modules/orders/domain/value-objects/order-channel';
import { OrderStatus } from '@modules/orders/domain/value-objects/order-status';
import type {
  FindOrdersInput,
  OrderRepository,
} from '@modules/orders/domain/repositories/order.repository';
import { OrderForAiService } from './order-for-ai.service';
import type { OrderAiActor } from '../ports/order-for-ai.port';

function order(id: string, overrides: Partial<Order> = {}): Order {
  return {
    id,
    businessUnitId: 'bu-1',
    customerId: 'customer-1',
    orderStatus: OrderStatus.READY,
    orderChannel: OrderChannel.APP,
    totalAmount: Money.fromDecimalString('50.00'),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    orderItems: [],
    ...overrides,
  } as Order;
}

/** Records the input it was asked for; returns whatever was staged. */
class RecordingOrderRepository implements Pick<OrderRepository, 'findMany'> {
  lastInput?: FindOrdersInput;
  rows: Order[] = [];

  findMany(input: FindOrdersInput): Promise<Order[]> {
    this.lastInput = input;
    return Promise.resolve(this.rows);
  }
}

const customer: OrderAiActor = {
  userId: 'customer-1',
  role: UserRole.CUSTOMER,
  businessUnitIds: [],
};

const manager: OrderAiActor = {
  userId: 'manager-1',
  role: UserRole.MANAGER,
  businessUnitIds: ['bu-1', 'bu-2'],
};

const admin: OrderAiActor = { userId: 'admin-1', role: UserRole.ADMIN, businessUnitIds: [] };

describe('OrderForAiService.listForActor', () => {
  let repo: RecordingOrderRepository;
  let service: OrderForAiService;

  beforeEach(() => {
    repo = new RecordingOrderRepository();
    service = new OrderForAiService(repo as unknown as OrderRepository);
  });

  describe('visibility scope', () => {
    // The regression this whole branch exists for: a customer carries no unit claim,
    // so scoping them by unit would send businessUnitIds: [] to the repo, which
    // matches nothing - every customer would see an empty order history.
    it('scopes a customer by their own id and never by unit', async () => {
      await service.listForActor({}, customer);

      expect(repo.lastInput?.filters).toMatchObject({ customerId: 'customer-1' });
      expect(repo.lastInput?.filters?.businessUnitIds).toBeUndefined();
    });

    it('ignores a businessUnitId a customer supplies', async () => {
      await service.listForActor({ businessUnitId: 'bu-9' }, customer);

      expect(repo.lastInput?.filters?.businessUnitIds).toBeUndefined();
      expect(repo.lastInput?.filters?.customerId).toBe('customer-1');
    });

    it('scopes staff to the units in their claim', async () => {
      await service.listForActor({}, manager);

      expect(repo.lastInput?.filters?.businessUnitIds).toEqual(['bu-1', 'bu-2']);
      expect(repo.lastInput?.filters?.customerId).toBeUndefined();
    });

    it('lets staff narrow within their claim', async () => {
      await service.listForActor({ businessUnitId: 'bu-2' }, manager);

      expect(repo.lastInput?.filters?.businessUnitIds).toEqual(['bu-2']);
    });

    it('yields no rows when staff ask for a unit outside their claim', async () => {
      await service.listForActor({ businessUnitId: 'bu-9' }, manager);

      // Empty array matches nothing - it must never widen to the full claim.
      expect(repo.lastInput?.filters?.businessUnitIds).toEqual([]);
    });

    it('leaves an admin unrestricted', async () => {
      await service.listForActor({}, admin);

      expect(repo.lastInput?.filters?.businessUnitIds).toBeUndefined();
    });
  });

  describe('model-supplied filters', () => {
    it('passes through a status and channel it recognises', async () => {
      await service.listForActor({ orderStatus: 'READY', orderChannel: 'APP' }, manager);

      expect(repo.lastInput?.filters).toMatchObject({
        orderStatus: OrderStatus.READY,
        orderChannel: OrderChannel.APP,
      });
    });

    it('drops a status or channel the model invented', async () => {
      await service.listForActor(
        { orderStatus: 'DEFINITELY_NOT_A_STATUS', orderChannel: 'FAX' },
        manager,
      );

      expect(repo.lastInput?.filters?.orderStatus).toBeUndefined();
      expect(repo.lastInput?.filters?.orderChannel).toBeUndefined();
    });
  });

  describe('capping', () => {
    it('over-fetches by one and reports hasMore without leaking the probe row', async () => {
      repo.rows = Array.from({ length: 11 }, (_, i) => order(`order-${i}`));

      const result = await service.listForActor({}, manager);

      expect(repo.lastInput?.take).toBe(11);
      expect(result.orders).toHaveLength(10);
      expect(result.hasMore).toBe(true);
    });

    it('reports hasMore false when the page is not full', async () => {
      repo.rows = [order('order-1')];

      const result = await service.listForActor({}, manager);

      expect(result.orders).toHaveLength(1);
      expect(result.hasMore).toBe(false);
    });
  });

  it('maps money to a decimal string, never a number', async () => {
    repo.rows = [order('order-1')];

    const result = await service.listForActor({}, manager);

    expect(result.orders[0]?.total).toBe('50.00');
  });

  // Without the snapshotted name the assistant can only emit a UUID, and the obvious
  // workaround - calling a catalog tool - returns the product's CURRENT name, which is
  // the drift the snapshot exists to remove.
  it('exposes the snapshotted product name so the model can name what was ordered', async () => {
    repo.rows = [
      order('order-1', {
        orderItems: [
          new OrderItem(
            'i-1',
            'order-1',
            'p-1',
            'Baiao de Dois',
            2,
            Money.fromDecimalString('25'),
            null,
          ),
        ],
      }),
    ];

    const result = await service.listForActor({}, manager);

    expect(result.orders[0]?.items[0]).toMatchObject({
      productId: 'p-1',
      productName: 'Baiao de Dois',
    });
  });
});
