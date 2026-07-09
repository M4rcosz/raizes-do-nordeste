import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { Server } from 'http';
import request from 'supertest';
import { randomUUID } from 'crypto';

// The webhook guard reads this secret on boot; set it before AppModule loads.
// dotenv does not override an already-set process.env var, so this wins over .env.
const WEBHOOK_SECRET = `e2e-webhook-${randomUUID()}`;
process.env.PAYMENT_WEBHOOK_SECRET = WEBHOOK_SECRET;

import { AppModule } from '../src/app.module';
import { PrismaService } from '@shared/infrastructure/prisma/prisma.service';
import { Argon2PasswordHasher } from '@modules/identity/infrastructure/security/argon2-password-hasher';
import { buildWebhookSignature } from '@modules/payments/infrastructure/http/guards/payment-webhook.guard';

interface PaymentBody {
  id: string;
  orderId: string;
  amount: string;
  status: string;
  method: string;
  extTransactionId: string | null;
}

interface OrderBody {
  id: string;
  orderStatus: string;
  totalAmount: string;
}

describe('Payments - critical flow A (e2e)', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;

  const password = 'customer-pass';
  // Stay within the 50-char username cap: a longer prefix plus a 36-char uuid
  // builds a name the login DTO rejects.
  const username = `e2e-pay-cust-${randomUUID()}`;
  let unitId: string;
  let categoryId: string;
  let productId: string;
  let customerId: string;
  let token: string;
  let otherCustomerId: string;
  let otherToken: string;

  const createOrder = async (unitPrice: string, quantity: number): Promise<OrderBody> => {
    const res = await request(server)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        businessUnitId: unitId,
        orderChannel: 'APP',
        orderItems: [{ productId, quantity, unitPrice }],
      })
      .expect(201);
    return res.body as OrderBody;
  };

  // Posts a gateway webhook signed with the same HMAC scheme the guard verifies.
  const postWebhook = (payload: { extTransactionId: string; status: string; amount: string }) => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = buildWebhookSignature(WEBHOOK_SECRET, {
      timestamp,
      extTransactionId: payload.extTransactionId,
      status: payload.status,
      amount: payload.amount,
    });
    return request(server)
      .post('/api/payments/webhook')
      .set('x-webhook-signature', signature)
      .set('x-webhook-timestamp', timestamp)
      .send(payload);
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: false },
      }),
    );
    await app.init();

    server = app.getHttpServer() as Server;
    prisma = moduleFixture.get(PrismaService);

    const tag = randomUUID().slice(0, 8);
    const unit = await prisma.businessUnit.create({
      data: {
        name: `E2E Pay Unit ${tag}`,
        cnpj: `e2e-pay-cnpj-${tag}`,
        address: 'rua e2e',
        city: 'Recife',
        phone: `e2e-pay-phone-${tag}`,
      },
    });
    unitId = unit.id;

    const category = await prisma.category.create({
      data: { name: `E2E Pay Cat ${tag}`, description: 'e2e' },
    });
    categoryId = category.id;

    const product = await prisma.product.create({
      data: {
        name: `E2E Pay Product ${tag}`,
        description: 'e2e',
        basePrice: '12.50',
        imageUrl: 'https://example.com/e2e.jpg',
        categoryId: category.id,
      },
    });
    productId = product.id;

    await prisma.businessUnitMenuItem.create({
      data: {
        businessUnitId: unit.id,
        productId: product.id,
        customPrice: '12.50',
        isAvailable: true,
      },
    });

    // Order creation deducts stock (RN-28): ample quantity so this suite never runs out.
    await prisma.inventory.create({
      data: {
        businessUnitId: unit.id,
        productId: product.id,
        quantity: 1000,
        minQuantity: 5,
      },
    });

    const hasher = new Argon2PasswordHasher();
    const passwordHash = await hasher.hash(password);
    const user = await prisma.user.create({
      data: {
        name: 'E2E Pay Customer',
        username,
        passwordHash,
        role: 'CUSTOMER',
        businessUnits: { create: [{ businessUnitId: unit.id }] },
      },
    });
    customerId = user.id;

    const login: { body: { access_token: string } } = await request(server)
      .post('/api/auth/login')
      .send({ username, password })
      .expect(200);
    token = login.body.access_token;

    // A second customer, used to prove a customer cannot pay someone else's order.
    const otherUsername = `e2e-pay-other-${tag}`;
    const other = await prisma.user.create({
      data: {
        name: 'E2E Pay Other',
        username: otherUsername,
        passwordHash,
        role: 'CUSTOMER',
        businessUnits: { create: [{ businessUnitId: unit.id }] },
      },
    });
    otherCustomerId = other.id;
    const otherLogin: { body: { access_token: string } } = await request(server)
      .post('/api/auth/login')
      .send({ username: otherUsername, password })
      .expect(200);
    otherToken = otherLogin.body.access_token;
  });

  afterAll(async () => {
    await prisma.inventoryTransaction.deleteMany({
      where: { inventory: { businessUnitId: unitId } },
    });
    await prisma.inventory.deleteMany({ where: { businessUnitId: unitId } });
    await prisma.loyaltyTransaction.deleteMany({
      where: { loyaltyAccount: { customerId: { in: [customerId, otherCustomerId] } } },
    });
    await prisma.loyaltyAccount.deleteMany({
      where: { customerId: { in: [customerId, otherCustomerId] } },
    });
    await prisma.payment.deleteMany({ where: { order: { businessUnitId: unitId } } });
    await prisma.orderItem.deleteMany({ where: { order: { businessUnitId: unitId } } });
    await prisma.order.deleteMany({ where: { businessUnitId: unitId } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: [customerId, otherCustomerId] } } });
    await prisma.businessUnitMenuItem.deleteMany({ where: { businessUnitId: unitId } });
    await prisma.product.deleteMany({ where: { categoryId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.user.deleteMany({ where: { id: { in: [customerId, otherCustomerId] } } });
    await prisma.businessUnit.deleteMany({ where: { id: unitId } });
    await app.close();
  });

  it('runs login, order, payment, webhook then order CONFIRMED with the expected audit trail', async () => {
    const order = await createOrder('12.50', 2);
    expect(order.orderStatus).toBe('PENDING');
    expect(order.totalAmount).toBe('25.00');

    // Webhook is the source of truth, so the payment starts as PROCESSING.
    const createRes = await request(server)
      .post('/api/payments')
      .set('Authorization', `Bearer ${token}`)
      .send({ orderId: order.id, method: 'PIX' })
      .expect(201);
    const payment = createRes.body as PaymentBody;
    expect(payment.status).toBe('PROCESSING');
    expect(payment.amount).toBe('25.00');
    expect(payment.extTransactionId).toEqual(expect.any(String));

    const webhookRes = await postWebhook({
      extTransactionId: payment.extTransactionId as string,
      status: 'APPROVED',
      amount: payment.amount,
    }).expect(200);
    expect(webhookRes.body).toEqual({ received: true });

    // Order advanced to CONFIRMED through the payment hook.
    const orderRes = await request(server)
      .get(`/api/orders/${order.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect((orderRes.body as OrderBody).orderStatus).toBe('CONFIRMED');

    // GET /orders/:orderId/payment returns the settled payment to the owner.
    const findRes = await request(server)
      .get(`/api/orders/${order.id}/payment`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect((findRes.body as PaymentBody).status).toBe('APPROVED');

    const actions = (await prisma.auditLog.findMany({ where: { userId: customerId } })).map(
      (r) => r.action,
    );
    expect(actions).toEqual(expect.arrayContaining(['ORDER_CREATED', 'PAYMENT_CREATED']));
    // The payment-driven confirm runs inside the payment transaction, so it does NOT emit
    // a separate ORDER_STATUS_CHANGED (that would risk auditing a change the tx may roll
    // back). The confirmation is traced by PAYMENT_APPROVED instead.
    const orderAudit = await prisma.auditLog.findMany({
      where: { entity: 'Order', entityId: order.id },
    });
    expect(orderAudit.some((r) => r.action === 'ORDER_STATUS_CHANGED')).toBe(false);
    const paymentAudit = await prisma.auditLog.findMany({
      where: { entity: 'Payment', entityId: payment.id },
    });
    expect(paymentAudit.some((r) => r.action === 'PAYMENT_APPROVED')).toBe(true);
  });

  it('rejects a webhook with no signature (401)', async () => {
    await request(server)
      .post('/api/payments/webhook')
      .send({ extTransactionId: 'whatever', status: 'APPROVED', amount: '25.00' })
      .expect(401);
  });

  it('acks an unknown transaction with 200 instead of a 404 retry storm', async () => {
    const res = await postWebhook({
      extTransactionId: `mock_${randomUUID()}`,
      status: 'APPROVED',
      amount: '25.00',
    }).expect(200);
    expect(res.body).toEqual({ received: true });
  });

  it('rejects a payment for a non-existent order (404)', async () => {
    await request(server)
      .post('/api/payments')
      .set('Authorization', `Bearer ${token}`)
      .send({ orderId: randomUUID(), method: 'PIX' })
      .expect(404);
  });

  it("hides another customer's order behind a 404 when they try to pay it", async () => {
    const order = await createOrder('12.50', 1); // owned by `customerId`

    await request(server)
      .post('/api/payments')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ orderId: order.id, method: 'PIX' })
      .expect(404);

    // Owner's order was never locked, so they can still pay it.
    await request(server)
      .post('/api/payments')
      .set('Authorization', `Bearer ${token}`)
      .send({ orderId: order.id, method: 'PIX' })
      .expect(201);
  });

  it('settles the payment without rolling back when the order already moved on (cancelled)', async () => {
    const order = await createOrder('12.50', 1);

    const createRes = await request(server)
      .post('/api/payments')
      .set('Authorization', `Bearer ${token}`)
      .send({ orderId: order.id, method: 'PIX' })
      .expect(201);
    const payment = createRes.body as PaymentBody;

    // The order moves on (e.g. customer cancels) while the charge is in flight.
    await prisma.order.update({ where: { id: order.id }, data: { orderStatus: 'CANCELLED' } });

    // The webhook must still settle the payment (money is the source of truth), not 422/500.
    const webhookRes = await postWebhook({
      extTransactionId: payment.extTransactionId as string,
      status: 'APPROVED',
      amount: payment.amount,
    }).expect(200);
    expect(webhookRes.body).toEqual({ received: true });

    // Order stays CANCELLED and the mismatch is flagged for reconciliation.
    const dbOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(dbOrder?.orderStatus).toBe('CANCELLED');
    const reconcile = await prisma.auditLog.findMany({
      where: { entity: 'Payment', entityId: payment.id, action: 'PAYMENT_RECONCILE_REQUIRED' },
    });
    expect(reconcile.length).toBeGreaterThan(0);
  });

  it('rejects paying the same order twice (422)', async () => {
    const order = await createOrder('12.50', 1);

    await request(server)
      .post('/api/payments')
      .set('Authorization', `Bearer ${token}`)
      .send({ orderId: order.id, method: 'PIX' })
      .expect(201);

    await request(server)
      .post('/api/payments')
      .set('Authorization', `Bearer ${token}`)
      .send({ orderId: order.id, method: 'PIX' })
      .expect(422);
  });

  it('allows a new payment attempt after a refusal, then confirms the order', async () => {
    const order = await createOrder('12.50', 1);

    // First attempt is REFUSED, so the order stays PENDING.
    const firstRes = await request(server)
      .post('/api/payments')
      .set('Authorization', `Bearer ${token}`)
      .send({ orderId: order.id, method: 'PIX' })
      .expect(201);
    const first = firstRes.body as PaymentBody;

    await postWebhook({
      extTransactionId: first.extTransactionId as string,
      status: 'REFUSED',
      amount: first.amount,
    }).expect(200);

    const afterRefusal = await request(server)
      .get(`/api/orders/${order.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect((afterRefusal.body as OrderBody).orderStatus).toBe('PENDING');

    // A refused attempt does not occupy the slot: a fresh attempt is allowed.
    const retryRes = await request(server)
      .post('/api/payments')
      .set('Authorization', `Bearer ${token}`)
      .send({ orderId: order.id, method: 'PIX' })
      .expect(201);
    const retry = retryRes.body as PaymentBody;
    expect(retry.extTransactionId).not.toBe(first.extTransactionId);

    await postWebhook({
      extTransactionId: retry.extTransactionId as string,
      status: 'APPROVED',
      amount: retry.amount,
    }).expect(200);

    const confirmed = await request(server)
      .get(`/api/orders/${order.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect((confirmed.body as OrderBody).orderStatus).toBe('CONFIRMED');
  });

  describe('loyalty points (RN-31)', () => {
    // Upsert: enrollment normally created the account on the first order, but this
    // keeps the suite independent of the tests that ran before it.
    const setConsent = async (consentGiven: boolean): Promise<void> => {
      const consentDate = consentGiven ? new Date() : null;
      await prisma.loyaltyAccount.upsert({
        where: { customerId },
        update: { consentGiven, consentDate },
        create: { customerId, consentGiven, consentDate },
      });
    };

    const payAndApprove = async (order: OrderBody): Promise<void> => {
      const res = await request(server)
        .post('/api/payments')
        .set('Authorization', `Bearer ${token}`)
        .send({ orderId: order.id, method: 'PIX' })
        .expect(201);
      const payment = res.body as PaymentBody;
      await postWebhook({
        extTransactionId: payment.extTransactionId as string,
        status: 'APPROVED',
        amount: payment.amount,
      }).expect(200);
    };

    const earnedFor = async (orderId: string): Promise<{ points: number }[]> =>
      prisma.loyaltyTransaction.findMany({ where: { orderId, type: 'EARN' } });

    it('credits floor(R$25 / 10) = 2 points when an approved payment confirms the order', async () => {
      // The account exists from earlier orders in this suite; opt the customer in.
      await setConsent(true);
      const before = await prisma.loyaltyAccount.findUniqueOrThrow({ where: { customerId } });

      const order = await createOrder('12.50', 2); // 25.00
      await payAndApprove(order);

      const earns = await earnedFor(order.id);
      expect(earns).toHaveLength(1);
      expect(earns[0].points).toBe(2);

      const after = await prisma.loyaltyAccount.findUniqueOrThrow({ where: { customerId } });
      expect(after.totalPoints).toBe(before.totalPoints + 2);
    });

    it('credits nothing without consent (LGPD gate)', async () => {
      await setConsent(false);

      const order = await createOrder('12.50', 2);
      await payAndApprove(order);

      expect(await earnedFor(order.id)).toHaveLength(0);
    });

    it('credits nothing when the order was cancelled before the approval landed', async () => {
      await setConsent(true);

      const order = await createOrder('12.50', 2);
      const res = await request(server)
        .post('/api/payments')
        .set('Authorization', `Bearer ${token}`)
        .send({ orderId: order.id, method: 'PIX' })
        .expect(201);
      const payment = res.body as PaymentBody;

      // The order moves on while the charge is in flight; the payment still settles.
      await prisma.order.update({ where: { id: order.id }, data: { orderStatus: 'CANCELLED' } });
      await postWebhook({
        extTransactionId: payment.extTransactionId as string,
        status: 'APPROVED',
        amount: payment.amount,
      }).expect(200);

      expect(await earnedFor(order.id)).toHaveLength(0);
    });
  });
});
