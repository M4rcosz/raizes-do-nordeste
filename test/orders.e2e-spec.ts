import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import type { Server } from 'http';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '@shared/infrastructure/prisma/prisma.service';
import { Argon2PasswordHasher } from '@modules/identity/infrastructure/security/argon2-password-hasher';

interface OrderItemBody {
  id: string;
  productId: string;
  quantity: number;
  unitPrice: string;
  subtotal: string;
  notes: string | null;
}

interface OrderResponseBody {
  id: string;
  businessUnitId: string;
  customerId: string | null;
  attendantId: string | null;
  pointsEarned: number;
  pointsRedeemed: number;
  totalAmount: string;
  orderStatus: string;
  orderChannel: string;
  orderItems: OrderItemBody[];
}

describe('Orders (e2e) — POST /api/orders', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;

  const password = 'customer-pass';
  const username = `e2e-customer-${randomUUID()}`;
  let unitId: string;
  let categoryId: string;
  let productId: string;
  let customerId: string;
  let token: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    server = app.getHttpServer() as Server;
    prisma = moduleFixture.get(PrismaService);

    const tag = randomUUID().slice(0, 8);
    const unit = await prisma.businessUnit.create({
      data: {
        name: `E2E Unit ${tag}`,
        cnpj: `e2e-cnpj-${tag}`,
        address: 'rua e2e',
        city: 'Recife',
        phone: `e2e-phone-${tag}`,
      },
    });
    unitId = unit.id;

    const category = await prisma.category.create({
      data: { name: `E2E Cat ${tag}`, description: 'e2e' },
    });
    categoryId = category.id;

    const product = await prisma.product.create({
      data: {
        name: `E2E Product ${tag}`,
        description: 'e2e',
        basePrice: '12.50',
        imageUrl: 'https://example.com/e2e.jpg',
        categoryId: category.id,
      },
    });
    productId = product.id;

    const hasher = new Argon2PasswordHasher();
    const passwordHash = await hasher.hash(password);
    const user = await prisma.user.create({
      data: {
        name: 'E2E Customer',
        username,
        passwordHash,
        role: 'CUSTOMER',
        businessUnitId: unit.id,
      },
    });
    customerId = user.id;

    const loginResponse: { body: { access_token: string } } = await request(server)
      .post('/api/auth/login')
      .send({ username, password })
      .expect(200);
    token = loginResponse.body.access_token;
  });

  afterAll(async () => {
    await prisma.orderItem.deleteMany({ where: { order: { businessUnitId: unitId } } });
    await prisma.order.deleteMany({ where: { businessUnitId: unitId } });
    await prisma.auditLog.deleteMany({ where: { userId: customerId } });
    await prisma.auditLog.deleteMany({ where: { entity: 'User', entityId: customerId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.user.deleteMany({ where: { id: customerId } });
    await prisma.businessUnit.deleteMany({ where: { id: unitId } });
    await app.close();
  });

  it('rejects an unauthenticated request with 401', async () => {
    await request(server)
      .post('/api/orders')
      .send({
        businessUnitId: unitId,
        orderChannel: 'APP',
        orderItems: [{ productId, quantity: 1, unitPrice: '12.50' }],
      })
      .expect(401);
  });

  it('rejects an empty orderItems array with 400', async () => {
    await request(server)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        businessUnitId: unitId,
        orderChannel: 'APP',
        orderItems: [],
      })
      .expect(400);
  });

  it('forbids a CUSTOMER from using the COUNTER channel with 403', async () => {
    await request(server)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        businessUnitId: unitId,
        orderChannel: 'COUNTER',
        orderItems: [{ productId, quantity: 1, unitPrice: '12.50' }],
      })
      .expect(403);
  });

  it('creates an order, persists items, and returns the computed totals (201)', async () => {
    const response = await request(server)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        businessUnitId: unitId,
        orderChannel: 'APP',
        orderItems: [
          { productId, quantity: 3, unitPrice: '12.50' },
          { productId, quantity: 2, unitPrice: '5.00' },
        ],
      })
      .expect(201);

    const body = response.body as OrderResponseBody;
    expect(body.id).toEqual(expect.any(String));
    expect(body.customerId).toBe(customerId);
    expect(body.attendantId).toBeNull();
    expect(body.orderChannel).toBe('APP');
    expect(body.orderStatus).toBe('PENDING');
    expect(body.totalAmount).toBe('47.50');
    expect(body.orderItems).toHaveLength(2);
    expect(body.orderItems[0].subtotal).toBe('37.50');
    expect(body.orderItems[1].subtotal).toBe('10.00');

    const dbOrder = await prisma.order.findUnique({
      where: { id: body.id },
      include: { orderItems: true },
    });
    expect(dbOrder).not.toBeNull();
    expect(dbOrder?.totalAmount.toString()).toBe('47.5');
    expect(dbOrder?.orderItems).toHaveLength(2);
  });
});
