import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { UserRole } from '@modules/identity/domain/value-objects/user-role';
import type { OrderForAiView } from '@modules/orders/application/ports/order-for-ai.port';
import { ToolRegistry } from './tool-registry';
import { FakeOrderForAi } from './__fakes__/order-for-ai.fake';
import { FakeLoyaltyForAi } from './__fakes__/loyalty-for-ai.fake';
import { FakeUserForAi } from './__fakes__/user-for-ai.fake';
import { FakeCatalogForAi } from './__fakes__/catalog-for-ai.fake';
import { FakeInventoryForAi } from './__fakes__/inventory-for-ai.fake';
import { FakePromotionForAi } from './__fakes__/promotion-for-ai.fake';
import type { ActorContext } from '../actor-context';

const actor: ActorContext = {
  userId: 'user-1',
  role: UserRole.CUSTOMER,
  businessUnitIds: [],
};

const manager: ActorContext = {
  userId: 'manager-1',
  role: UserRole.MANAGER,
  businessUnitIds: ['bu-1'],
};

const admin: ActorContext = {
  userId: 'admin-1',
  role: UserRole.ADMIN,
  businessUnitIds: [],
};

function orderView(overrides: Partial<OrderForAiView> = {}): OrderForAiView {
  return {
    id: 'order-1',
    status: 'READY',
    channel: 'APP',
    businessUnitId: 'bu-1',
    customerId: 'user-1',
    total: '50.00',
    createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    items: [],
    ...overrides,
  };
}

describe('ToolRegistry', () => {
  let orders: FakeOrderForAi;
  let loyalty: FakeLoyaltyForAi;
  let users: FakeUserForAi;
  let catalog: FakeCatalogForAi;
  let inventory: FakeInventoryForAi;
  let promotions: FakePromotionForAi;
  let registry: ToolRegistry;

  beforeEach(() => {
    orders = new FakeOrderForAi();
    loyalty = new FakeLoyaltyForAi();
    users = new FakeUserForAi();
    catalog = new FakeCatalogForAi();
    inventory = new FakeInventoryForAi();
    promotions = new FakePromotionForAi();
    registry = new ToolRegistry(orders, loyalty, users, catalog, inventory, promotions);
  });

  describe('getDeclarations', () => {
    it('gives a customer the catalog and their own data, but no staff tools', () => {
      const names = registry.getDeclarations(actor).map((d) => d.name);

      expect(names).toEqual([
        'findOrderById',
        'getMyLoyalty',
        'listOrders',
        'listBusinessUnits',
        'listCategories',
        'listMenuItems',
      ]);
      expect(names).not.toContain('listUsers');
      expect(names).not.toContain('listInventory');
      expect(names).not.toContain('listPromotions');
    });

    it('gives a manager the staff tools but never listUsers', () => {
      const names = registry.getDeclarations(manager).map((d) => d.name);

      expect(names).toContain('listInventory');
      expect(names).toContain('listPromotions');
      expect(names).not.toContain('listUsers');
      // Loyalty is a customer's own account; staff have none.
      expect(names).not.toContain('getMyLoyalty');
    });

    it('gives an admin listUsers', () => {
      expect(registry.getDeclarations(admin).map((d) => d.name)).toContain('listUsers');
    });

    it('declares every tool with a well-formed schema', () => {
      const decls = registry.getDeclarations(admin);

      for (const decl of decls) {
        expect(decl.description).toBeTruthy();
        expect(decl.parametersJsonSchema).toMatchObject({ type: 'object' });
      }

      const findOrder = decls.find((d) => d.name === 'findOrderById')!;
      expect(findOrder.parametersJsonSchema).toMatchObject({
        type: 'object',
        properties: { orderId: { type: 'string', format: 'uuid' } },
        required: ['orderId'],
      });
    });
  });

  describe('role gate on dispatch', () => {
    // The declaration filter is token economy; this is the actual guard. A model is
    // free to name a tool that was never declared to it, so each of these would be a
    // privilege escalation if dispatch trusted getDeclarations.
    it('refuses listUsers for a manager, without reaching the port', async () => {
      const result = await registry.dispatch({ name: 'listUsers', args: {} }, manager);

      expect(result).toEqual({ name: 'listUsers', response: { error: 'unknown tool' } });
      expect(users.calls).toEqual([]);
    });

    it('refuses listInventory for a customer, without reaching the port', async () => {
      const result = await registry.dispatch(
        { name: 'listInventory', args: { businessUnitId: 'bu-1' } },
        actor,
      );

      expect(result).toEqual({ name: 'listInventory', response: { error: 'unknown tool' } });
      expect(inventory.calls).toEqual([]);
    });

    it('refuses listPromotions for a customer, without reaching the port', async () => {
      const result = await registry.dispatch(
        { name: 'listPromotions', args: { businessUnitId: 'bu-1' } },
        actor,
      );

      expect(result).toEqual({ name: 'listPromotions', response: { error: 'unknown tool' } });
      expect(promotions.calls).toEqual([]);
    });

    it('refuses getMyLoyalty for staff', async () => {
      const result = await registry.dispatch({ name: 'getMyLoyalty', args: {} }, manager);

      expect(result.response).toEqual({ error: 'unknown tool' });
      expect(loyalty.calls).toEqual([]);
    });
  });

  describe('missing required arguments', () => {
    // `required` in a JSON schema is a hint the model may ignore. Defaulting to ''
    // would push an empty string into a uuid column: for listInventory an ADMIN
    // passes the scope check, so the bad value would reach a real query.
    it('tells the model which argument findOrderById was missing', async () => {
      const result = await registry.dispatch({ name: 'findOrderById', args: {} }, actor);

      expect(result.response).toEqual({ error: 'missing required argument: orderId' });
      expect(orders.calls).toEqual([]);
    });

    it('refuses listInventory with no unit id, for an admin too', async () => {
      const result = await registry.dispatch({ name: 'listInventory', args: {} }, admin);

      expect(result.response).toEqual({ error: 'missing required argument: businessUnitId' });
      expect(inventory.calls).toEqual([]);
    });

    it('refuses listPromotions and listMenuItems with no unit id', async () => {
      const promo = await registry.dispatch({ name: 'listPromotions', args: {} }, manager);
      const menu = await registry.dispatch({ name: 'listMenuItems', args: {} }, actor);

      expect(promo.response).toEqual({ error: 'missing required argument: businessUnitId' });
      expect(menu.response).toEqual({ error: 'missing required argument: businessUnitId' });
      expect(promotions.calls).toEqual([]);
      expect(catalog.menuCalls).toEqual([]);
    });

    it('treats a non-string required arg as missing rather than coercing it', async () => {
      const result = await registry.dispatch(
        { name: 'listMenuItems', args: { businessUnitId: 42 } },
        actor,
      );

      expect(result.response).toEqual({ error: 'missing required argument: businessUnitId' });
      expect(catalog.menuCalls).toEqual([]);
    });
  });

  describe('dispatch resilience', () => {
    it('returns an error result (never throws) when a handler fails', async () => {
      jest.spyOn(orders, 'findByIdForActor').mockRejectedValue(new Error('db down'));

      const result = await registry.dispatch(
        { name: 'findOrderById', args: { orderId: 'order-1' } },
        actor,
      );

      // Generic signal, no leak of the underlying error, and the turn is not aborted.
      expect(result).toEqual({ name: 'findOrderById', response: { error: 'tool failed' } });
    });

    it('returns an error result for an unknown tool name', async () => {
      const result = await registry.dispatch({ name: 'noSuchTool', args: {} }, actor);
      expect(result).toEqual({ name: 'noSuchTool', response: { error: 'unknown tool' } });
    });
  });

  describe('findOrderById', () => {
    it('returns the order view under the actor when visible', async () => {
      orders.seed(orderView());

      const result = await registry.dispatch(
        { name: 'findOrderById', args: { orderId: 'order-1' } },
        actor,
      );

      expect(result).toEqual({
        name: 'findOrderById',
        response: { found: true, order: orderView() },
      });
      expect(orders.calls[0]?.actor.userId).toBe('user-1');
    });

    it('returns found:false when the order is not visible to the actor', async () => {
      orders.seed(orderView(), ['someone-else']);

      const result = await registry.dispatch(
        { name: 'findOrderById', args: { orderId: 'order-1' } },
        actor,
      );

      expect(result.response).toEqual({ found: false });
    });
  });

  describe('getMyLoyalty', () => {
    it('forces the customer id from the actor and ignores any args', async () => {
      loyalty.seed('user-1', { pointsBalance: 42, hasConsent: true, enrolledAt: 'x' });

      const result = await registry.dispatch(
        { name: 'getMyLoyalty', args: { customerId: 'attacker' } },
        actor,
      );

      expect(loyalty.calls).toEqual(['user-1']);
      expect(result.response).toEqual({
        enrolled: true,
        loyalty: { pointsBalance: 42, hasConsent: true, enrolledAt: 'x' },
      });
    });

    it('returns enrolled:false when the customer has no account', async () => {
      const result = await registry.dispatch({ name: 'getMyLoyalty', args: {} }, actor);
      expect(result.response).toEqual({ enrolled: false });
    });
  });

  describe('listOrders', () => {
    it('passes the actor through and returns the visible page', async () => {
      orders.seed(orderView());
      orders.listHasMore = true;

      const result = await registry.dispatch({ name: 'listOrders', args: {} }, actor);

      expect(result).toEqual({
        name: 'listOrders',
        response: { orders: [orderView()], hasMore: true },
      });
      expect(orders.listCalls[0]?.actor).toEqual({
        userId: 'user-1',
        role: UserRole.CUSTOMER,
        businessUnitIds: [],
      });
    });

    it('forwards the model-supplied filters, parsing dates', async () => {
      await registry.dispatch(
        {
          name: 'listOrders',
          args: {
            businessUnitId: 'bu-1',
            orderStatus: 'READY',
            orderChannel: 'APP',
            createdAtFrom: '2026-01-01T00:00:00.000Z',
          },
        },
        manager,
      );

      expect(orders.listCalls[0]?.filters).toEqual({
        businessUnitId: 'bu-1',
        orderStatus: 'READY',
        orderChannel: 'APP',
        createdAtFrom: new Date('2026-01-01T00:00:00.000Z'),
        createdAtTo: undefined,
      });
    });

    it('drops args that are not usable strings rather than coercing them', async () => {
      // The model can send anything. A dropped filter widens the (already scoped)
      // result, which is harmless; a coerced one could narrow to nonsense.
      await registry.dispatch(
        {
          name: 'listOrders',
          args: { businessUnitId: 42, orderStatus: '', createdAtFrom: 'nope' },
        },
        manager,
      );

      expect(orders.listCalls[0]?.filters).toEqual({
        businessUnitId: undefined,
        orderStatus: undefined,
        orderChannel: undefined,
        createdAtFrom: undefined,
        createdAtTo: undefined,
      });
    });
  });

  describe('listUsers', () => {
    it('reaches the port for an admin and forwards the filters', async () => {
      users.seed({
        id: 'u-1',
        username: 'ana',
        name: 'Ana',
        role: 'MANAGER',
        isActive: true,
        businessUnitIds: ['bu-1'],
      });

      const result = await registry.dispatch(
        { name: 'listUsers', args: { username: 'an' } },
        admin,
      );

      expect(users.calls[0]?.filters).toEqual({ username: 'an', businessUnitId: undefined });
      expect(result.response).toMatchObject({ hasMore: false });
      expect(result.name).toBe('listUsers');
    });
  });

  describe('catalog tools', () => {
    it('listBusinessUnits forwards the search term', async () => {
      catalog.seedBusinessUnits({
        id: 'bu-1',
        name: 'Centro',
        address: 'Rua A',
        city: 'Recife',
        phone: '81999999999',
      });

      const result = await registry.dispatch(
        { name: 'listBusinessUnits', args: { search: 'cen' } },
        actor,
      );

      expect(catalog.unitCalls).toEqual(['cen']);
      expect(result.response).toMatchObject({ hasMore: false });
    });

    it('listCategories works with no args', async () => {
      const result = await registry.dispatch({ name: 'listCategories', args: {} }, actor);

      expect(catalog.categoryCalls).toEqual([undefined]);
      expect(result.response).toEqual({ categories: [], hasMore: false });
    });

    it('listMenuItems forwards the unit id', async () => {
      catalog.seedMenu('bu-1', {
        id: 'mi-1',
        productId: 'p-1',
        productName: 'Baiao de Dois',
        description: null,
        price: '32.00',
      });

      const result = await registry.dispatch(
        { name: 'listMenuItems', args: { businessUnitId: 'bu-1' } },
        actor,
      );

      expect(catalog.menuCalls).toEqual(['bu-1']);
      expect(result.response).toMatchObject({
        menuItems: [expect.objectContaining({ productName: 'Baiao de Dois' })],
      });
    });
  });

  describe('unit-scoped staff tools', () => {
    it('listInventory passes the unit and actor to the port', async () => {
      inventory.seed('bu-1', {
        productId: 'p-1',
        quantity: 3,
        minQuantity: 5,
        isLowStock: true,
      });

      const result = await registry.dispatch(
        { name: 'listInventory', args: { businessUnitId: 'bu-1' } },
        manager,
      );

      expect(inventory.calls[0]).toEqual({
        businessUnitId: 'bu-1',
        actor: { userId: 'manager-1', role: UserRole.MANAGER, businessUnitIds: ['bu-1'] },
      });
      expect(result.response).toMatchObject({
        inventory: [expect.objectContaining({ isLowStock: true })],
      });
    });

    it('listPromotions passes the unit and actor to the port', async () => {
      const result = await registry.dispatch(
        { name: 'listPromotions', args: { businessUnitId: 'bu-9' } },
        manager,
      );

      expect(promotions.calls[0]?.businessUnitId).toBe('bu-9');
      expect(promotions.calls[0]?.actor.businessUnitIds).toEqual(['bu-1']);
      expect(result.response).toEqual({ promotions: [], hasMore: false });
    });
  });

  describe('unknown tool', () => {
    it('returns an error result without throwing', async () => {
      const result = await registry.dispatch({ name: 'dropTable', args: {} }, actor);
      expect(result).toEqual({ name: 'dropTable', response: { error: 'unknown tool' } });
    });
  });
});
