import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { UserRole } from '@modules/identity/domain/value-objects/user-role';
import type { OrderForAiView } from '@modules/orders/application/ports/order-for-ai.port';
import { ToolRegistry } from './tool-registry';
import { FakeOrderForAi } from './__fakes__/order-for-ai.fake';
import { FakeLoyaltyForAi } from './__fakes__/loyalty-for-ai.fake';
import type { ActorContext } from '../actor-context';

const actor: ActorContext = {
  userId: 'user-1',
  role: UserRole.CUSTOMER,
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
  let registry: ToolRegistry;

  beforeEach(() => {
    orders = new FakeOrderForAi();
    loyalty = new FakeLoyaltyForAi();
    registry = new ToolRegistry(orders, loyalty);
  });

  describe('getDeclarations', () => {
    it('exposes two well-formed tool declarations', () => {
      const decls = registry.getDeclarations();
      expect(decls.map((d) => d.name)).toEqual(['findOrderById', 'getMyLoyalty']);

      const findOrder = decls.find((d) => d.name === 'findOrderById')!;
      expect(findOrder.description).toBeTruthy();
      expect(findOrder.parametersJsonSchema).toMatchObject({
        type: 'object',
        properties: { orderId: { type: 'string', format: 'uuid' } },
        required: ['orderId'],
      });

      const getLoyalty = decls.find((d) => d.name === 'getMyLoyalty')!;
      expect(getLoyalty.parametersJsonSchema).toMatchObject({ type: 'object', properties: {} });
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

  describe('unknown tool', () => {
    it('returns an error result without throwing', async () => {
      const result = await registry.dispatch({ name: 'dropTable', args: {} }, actor);
      expect(result).toEqual({ name: 'dropTable', response: { error: 'unknown tool' } });
    });
  });
});
