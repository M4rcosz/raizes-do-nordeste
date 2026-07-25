import { createHash } from 'node:crypto';
import { PrismaClient, type Prisma } from '@prisma/client';
import { seedId } from './ids';
import { daysAgo } from './clock';
import type { Catalog } from './catalog';
import type { People } from './people';
import type { Promotions } from './promotions';
import type { OrderPlan, PlannedOrder } from './orders';

interface AuditContext {
  catalog: Catalog;
  people: People;
  promotions: Promotions;
  plan: OrderPlan;
  adminId: string;
}

/**
 * A trail that matches the seeded history instead of inventing one: the entity ids
 * point at rows that exist, so following an audit line actually lands somewhere.
 * Metadata stays free of the fields the redactor strips (password, token, CPF).
 */
export async function seedAuditTrail(prisma: PrismaClient, context: AuditContext): Promise<void> {
  const { catalog, people, promotions, plan, adminId } = context;
  const orderOf = (key: string): PlannedOrder => {
    const order = plan.orders.find((candidate) => candidate.key === key);
    if (!order) {
      throw new Error(`Audit trail references unknown seed order ${key}.`);
    }
    return order;
  };

  const entries: {
    key: string;
    userId: string | null;
    action: string;
    entity: string;
    entityId: string | null;
    metadata: Prisma.InputJsonValue;
    daysAgo: number;
  }[] = [
    {
      key: 'admin-login',
      userId: adminId,
      action: 'LOGIN_SUCCESS',
      entity: 'User',
      entityId: adminId,
      metadata: { username: 'nexio.admin', ip: '203.0.113.10' },
      daysAgo: 1,
    },
    {
      key: 'failed-login',
      userId: null,
      action: 'LOGIN_FAILED',
      entity: 'User',
      entityId: null,
      metadata: { username: 'clara.mendes', reason: 'INVALID_CREDENTIALS', ip: '203.0.113.77' },
      daysAgo: 1,
    },
    {
      key: 'ana-registered',
      userId: people.ids.ana,
      action: 'CUSTOMER_REGISTERED',
      entity: 'User',
      entityId: people.ids.ana,
      metadata: { username: 'ana.lima', channel: 'WEB' },
      daysAgo: 180,
    },
    {
      key: 'rafael-created',
      userId: adminId,
      action: 'USER_CREATED',
      entity: 'User',
      entityId: people.ids.rafael,
      metadata: { username: 'rafael.souza', role: 'ATTENDANT' },
      daysAgo: 170,
    },
    {
      key: 'helena-units',
      userId: adminId,
      action: 'USER_BUSINESS_UNITS_CHANGED',
      entity: 'User',
      entityId: people.ids.helena,
      metadata: {
        added: [catalog.unitIds.patos],
        businessUnitIds: [catalog.unitIds.uberaba, catalog.unitIds.patos],
      },
      daysAgo: 50,
    },
    {
      key: 'lucas-deactivated',
      userId: adminId,
      action: 'USER_DEACTIVATED',
      entity: 'User',
      entityId: people.ids.lucas,
      metadata: { username: 'lucas.ferraz', reason: 'Left the company' },
      daysAgo: 1,
    },
    {
      key: 'ituiutaba-closed',
      userId: adminId,
      action: 'BUSINESS_UNIT_DEACTIVATED',
      entity: 'BusinessUnit',
      entityId: catalog.unitIds.ituiutaba,
      metadata: { name: 'Rainbow Flavors - Ituiutaba', reason: 'Unit closed' },
      daysAgo: 55,
    },
    {
      key: 'ana-consent',
      userId: people.ids.ana,
      action: 'LOYALTY_CONSENT_GIVEN',
      entity: 'LoyaltyAccount',
      entityId: people.loyaltyAccountIds.ana ?? null,
      metadata: { customerId: people.ids.ana },
      daysAgo: 180,
    },
    {
      key: 'erika-consent-revoked',
      userId: people.ids.erika,
      action: 'LOYALTY_CONSENT_REVOKED',
      entity: 'LoyaltyAccount',
      entityId: people.loyaltyAccountIds.erika ?? null,
      metadata: { customerId: people.ids.erika },
      daysAgo: 20,
    },
    {
      key: 'order-ana-created',
      userId: people.ids.ana,
      action: 'ORDER_CREATED',
      entity: 'Order',
      entityId: orderOf('app-ana-recent-delivered').id,
      metadata: { channel: 'APP', businessUnitId: catalog.unitIds.uberlandia },
      daysAgo: 2,
    },
    {
      key: 'order-ana-delivered',
      userId: people.ids.clara,
      action: 'ORDER_STATUS_CHANGED',
      entity: 'Order',
      entityId: orderOf('app-ana-recent-delivered').id,
      metadata: { from: 'READY', to: 'DELIVERED' },
      daysAgo: 2,
    },
    {
      key: 'payment-ana-approved',
      userId: people.ids.ana,
      action: 'PAYMENT_APPROVED',
      entity: 'Payment',
      entityId: orderOf('app-ana-recent-delivered').payments[0].id,
      metadata: { method: 'PIX', orderId: orderOf('app-ana-recent-delivered').id },
      daysAgo: 2,
    },
    {
      key: 'payment-felipe-refused',
      userId: people.ids.felipe,
      action: 'PAYMENT_REFUSED',
      entity: 'Payment',
      entityId: orderOf('app-felipe-retry-delivered').payments[0].id,
      metadata: { method: 'CREDIT_CARD', reason: 'INSUFFICIENT_FUNDS' },
      daysAgo: 5,
    },
    {
      key: 'payment-erika-refunded',
      userId: people.ids.diego,
      action: 'PAYMENT_REFUNDED',
      entity: 'Payment',
      entityId: orderOf('web-erika-cancelled').payments[0].id,
      metadata: { orderId: orderOf('web-erika-cancelled').id },
      daysAgo: 9,
    },
    {
      key: 'order-erika-cancelled',
      userId: people.ids.diego,
      action: 'ORDER_CANCELLED',
      entity: 'Order',
      entityId: orderOf('web-erika-cancelled').id,
      metadata: { reason: 'Customer request', stockRestored: true },
      daysAgo: 9,
    },
    {
      key: 'inventory-initialized',
      userId: adminId,
      action: 'INVENTORY_ITEM_INITIALIZED',
      entity: 'Inventory',
      entityId: seedId('inventory:uberaba/comboChicken'),
      metadata: { businessUnitId: catalog.unitIds.uberaba, quantity: 45 },
      daysAgo: 90,
    },
    {
      key: 'inventory-adjusted',
      userId: people.ids.clara,
      action: 'INVENTORY_ADJUSTED',
      entity: 'Inventory',
      entityId: seedId('inventory:uberlandia/pudim'),
      metadata: { type: 'OUT', quantity: 2, reason: 'Spoilage' },
      daysAgo: 7,
    },
    {
      key: 'stock-alert',
      userId: people.ids.clara,
      action: 'STOCK_ALERT',
      entity: 'Inventory',
      entityId: seedId('inventory:uberlandia/pudim'),
      metadata: { quantity: 3, minQuantity: 5 },
      daysAgo: 7,
    },
    {
      key: 'promotion-deactivated',
      userId: people.ids.diego,
      action: 'PROMOTION_DEACTIVATED',
      entity: 'Promotion',
      entityId: promotions.ids.retiredFixed,
      metadata: { name: 'Retired R$3 off' },
      daysAgo: 12,
    },
    {
      key: 'ai-enrolled',
      userId: adminId,
      action: 'AI_MEMBERSHIP_ENROLLED',
      entity: 'AiMembership',
      entityId: seedId('ai-membership:helena'),
      metadata: { userId: people.ids.helena, tokenBalance: 120000 },
      daysAgo: 50,
    },
    {
      key: 'ai-revoked',
      userId: adminId,
      action: 'AI_MEMBERSHIP_REVOKED',
      entity: 'AiMembership',
      entityId: seedId('ai-membership:henrique'),
      metadata: { userId: people.ids.henrique, changed: true },
      daysAgo: 5,
    },
  ];

  for (const entry of entries) {
    await prisma.auditLog.upsert({
      where: { id: seedId(`audit:${entry.key}`) },
      update: {},
      create: {
        id: seedId(`audit:${entry.key}`),
        userId: entry.userId,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId,
        metadata: entry.metadata,
        createdAt: daysAgo(entry.daysAgo),
      },
    });
  }

  await seedIdempotencyKeys(prisma, context);
}

const IDEMPOTENCY_TTL_HOURS = 24;

/**
 * Replay records for two order creations. The row only exists because the order did:
 * both are written in one transaction, so an idempotency key with no order behind it
 * would be a state the API cannot produce.
 */
async function seedIdempotencyKeys(prisma: PrismaClient, context: AuditContext): Promise<void> {
  const { plan, people } = context;
  const records: { orderKey: string; userId: string; key: string; daysAgo: number }[] = [
    {
      orderKey: 'app-ana-recent-delivered',
      userId: people.ids.ana,
      key: '8f1d2c4a-0b6e-4c11-9a53-5f0c2d7e9b31',
      daysAgo: 2,
    },
    {
      orderKey: 'app-daniel-pending',
      userId: people.ids.daniel,
      key: 'b7c9e0d2-3a41-4f88-9d10-6e2b8c4f5a77',
      daysAgo: 0,
    },
  ];

  for (const record of records) {
    const order = plan.orders.find((candidate) => candidate.key === record.orderKey);
    if (!order) {
      throw new Error(`Idempotency record references unknown seed order ${record.orderKey}.`);
    }

    const createdAt = daysAgo(record.daysAgo);
    await prisma.idempotencyKey.upsert({
      where: {
        userId_endpoint_key: { userId: record.userId, endpoint: 'POST /orders', key: record.key },
      },
      update: {},
      create: {
        id: seedId(`idempotency:${record.orderKey}`),
        key: record.key,
        userId: record.userId,
        endpoint: 'POST /orders',
        // Stands in for the hash of the original request body: any different body under
        // the same key is a reuse error, so the value has to be stable per order.
        requestHash: createHash('sha256').update(`seed:${order.id}`).digest('hex'),
        orderId: order.id,
        createdAt,
        expiresAt: new Date(createdAt.getTime() + IDEMPOTENCY_TTL_HOURS * 60 * 60 * 1000),
      },
    });
  }
}
