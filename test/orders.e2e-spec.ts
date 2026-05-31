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

describe('Orders (e2e)', () => {
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
  let staffId: string;
  let staffToken: string;
  let otherCustomerId: string;
  let otherToken: string;

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

    // The product is only orderable once it is on this unit's menu.
    await prisma.businessUnitMenuItem.create({
      data: {
        businessUnitId: unit.id,
        productId: product.id,
        customPrice: '12.50',
        isAvailable: true,
      },
    });

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

    const login = async (uname: string): Promise<string> => {
      const res: { body: { access_token: string } } = await request(server)
        .post('/api/auth/login')
        .send({ username: uname, password })
        .expect(200);
      return res.body.access_token;
    };

    token = await login(username);

    const staffUsername = `e2e-staff-${randomUUID()}`;
    const staff = await prisma.user.create({
      data: {
        name: 'E2E Staff',
        username: staffUsername,
        passwordHash,
        role: 'MANAGER',
        businessUnitId: unit.id,
      },
    });
    staffId = staff.id;
    staffToken = await login(staffUsername);

    const otherUsername = `e2e-other-${randomUUID()}`;
    const other = await prisma.user.create({
      data: {
        name: 'E2E Other Customer',
        username: otherUsername,
        passwordHash,
        role: 'CUSTOMER',
        businessUnitId: unit.id,
      },
    });
    otherCustomerId = other.id;
    otherToken = await login(otherUsername);
  });

  afterAll(async () => {
    const userIds = [customerId, staffId, otherCustomerId];
    await prisma.orderItem.deleteMany({ where: { order: { businessUnitId: unitId } } });
    await prisma.order.deleteMany({ where: { businessUnitId: unitId } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.auditLog.deleteMany({ where: { entity: 'User', entityId: { in: userIds } } });
    await prisma.businessUnitMenuItem.deleteMany({ where: { businessUnitId: unitId } });
    await prisma.product.deleteMany({ where: { categoryId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
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

  it('rejects with 404 when the product is not on this unit menu', async () => {
    const offMenuProduct = await prisma.product.create({
      data: {
        name: `E2E OffMenu ${randomUUID().slice(0, 8)}`,
        description: 'off-menu',
        basePrice: '12.50',
        imageUrl: 'https://example.com/off-menu.jpg',
        categoryId,
      },
    });

    try {
      await request(server)
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({
          businessUnitId: unitId,
          orderChannel: 'APP',
          orderItems: [{ productId: offMenuProduct.id, quantity: 1, unitPrice: '12.50' }],
        })
        .expect(404);
    } finally {
      await prisma.product.delete({ where: { id: offMenuProduct.id } });
    }
  });

  it('rejects with 422 when the product is inactive', async () => {
    const inactiveProduct = await prisma.product.create({
      data: {
        name: `E2E Inactive ${randomUUID().slice(0, 8)}`,
        description: 'inactive',
        basePrice: '12.50',
        imageUrl: 'https://example.com/inactive.jpg',
        categoryId,
        isActive: false,
        menuItems: {
          create: { businessUnitId: unitId, customPrice: '12.50', isAvailable: true },
        },
      },
    });

    try {
      await request(server)
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({
          businessUnitId: unitId,
          orderChannel: 'APP',
          orderItems: [{ productId: inactiveProduct.id, quantity: 1, unitPrice: '12.50' }],
        })
        .expect(422);
    } finally {
      await prisma.businessUnitMenuItem.deleteMany({
        where: { productId: inactiveProduct.id },
      });
      await prisma.product.delete({ where: { id: inactiveProduct.id } });
    }
  });

  it('rejects with 422 when the menu item is unavailable', async () => {
    const unavailableProduct = await prisma.product.create({
      data: {
        name: `E2E Unavailable ${randomUUID().slice(0, 8)}`,
        description: 'unavailable',
        basePrice: '12.50',
        imageUrl: 'https://example.com/unavailable.jpg',
        categoryId,
        menuItems: {
          create: { businessUnitId: unitId, customPrice: '12.50', isAvailable: false },
        },
      },
    });

    try {
      await request(server)
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({
          businessUnitId: unitId,
          orderChannel: 'APP',
          orderItems: [{ productId: unavailableProduct.id, quantity: 1, unitPrice: '12.50' }],
        })
        .expect(422);
    } finally {
      await prisma.businessUnitMenuItem.deleteMany({
        where: { productId: unavailableProduct.id },
      });
      await prisma.product.delete({ where: { id: unavailableProduct.id } });
    }
  });

  it('rejects with 422 when unitPrice does not match the authoritative menu price', async () => {
    await request(server)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        businessUnitId: unitId,
        orderChannel: 'APP',
        orderItems: [{ productId, quantity: 1, unitPrice: '0.01' }],
      })
      .expect(422);
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
          { productId, quantity: 2, unitPrice: '12.50' },
        ],
      })
      .expect(201);

    const body = response.body as OrderResponseBody;
    expect(body.id).toEqual(expect.any(String));
    expect(body.customerId).toBe(customerId);
    expect(body.attendantId).toBeNull();
    expect(body.orderChannel).toBe('APP');
    expect(body.orderStatus).toBe('PENDING');
    expect(body.totalAmount).toBe('62.50');
    expect(body.pointsEarned).toBe(0);
    expect(body.orderItems).toHaveLength(2);
    expect(body.orderItems[0].subtotal).toBe('37.50');
    expect(body.orderItems[1].subtotal).toBe('25.00');

    const dbOrder = await prisma.order.findUnique({
      where: { id: body.id },
      include: { orderItems: true },
    });
    expect(dbOrder).not.toBeNull();
    expect(dbOrder?.totalAmount.toString()).toBe('62.5');
    expect(dbOrder?.orderItems).toHaveLength(2);
  });

  describe('GET / PATCH', () => {
    const createOrder = async (): Promise<string> => {
      const res = await request(server)
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({
          businessUnitId: unitId,
          orderChannel: 'APP',
          orderItems: [{ productId, quantity: 1, unitPrice: '12.50' }],
        })
        .expect(201);
      return (res.body as OrderResponseBody).id;
    };

    it('GET /orders/:id returns the order to its owner', async () => {
      const id = await createOrder();

      const res = await request(server)
        .get(`/api/orders/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect((res.body as OrderResponseBody).id).toBe(id);
    });

    it('GET /orders/:id hides another customer order with 404', async () => {
      const id = await createOrder();

      await request(server)
        .get(`/api/orders/${id}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(404);
    });

    it('GET /orders forbids a CUSTOMER with 403', async () => {
      await request(server).get('/api/orders').set('Authorization', `Bearer ${token}`).expect(403);
    });

    it('GET /orders?orderChannel=APP returns only APP orders to staff', async () => {
      await createOrder();

      const res = await request(server)
        .get('/api/orders?orderChannel=APP')
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);

      const body = res.body as { data: OrderResponseBody[]; meta: { hasMore: boolean } };
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThan(0);
      expect(body.data.every((o) => o.orderChannel === 'APP')).toBe(true);
    });

    it('PATCH /orders/:id/status performs a valid transition', async () => {
      const id = await createOrder();

      const res = await request(server)
        .patch(`/api/orders/${id}/status`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ orderStatus: 'CONFIRMED' })
        .expect(200);

      expect((res.body as OrderResponseBody).orderStatus).toBe('CONFIRMED');

      const dbOrder = await prisma.order.findUnique({ where: { id } });
      expect(dbOrder?.orderStatus).toBe('CONFIRMED');
      expect(dbOrder?.updatedById).toBe(staffId);
    });

    it('PATCH /orders/:id/status rejects an invalid transition with 422', async () => {
      const id = await createOrder();

      await request(server)
        .patch(`/api/orders/${id}/status`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ orderStatus: 'DELIVERED' })
        .expect(422);
    });

    it('PATCH /orders/:id/status forbids a CUSTOMER with 403', async () => {
      const id = await createOrder();

      await request(server)
        .patch(`/api/orders/${id}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ orderStatus: 'CONFIRMED' })
        .expect(403);
    });

    it('PATCH /orders/:id/status applies a concurrent transition exactly once', async () => {
      const id = await createOrder();

      // Two staff fire the same PENDING -> CONFIRMED transition at once. The optimistic
      // lock must let exactly one win; the other is rejected with 409 (lost the race) or
      // 422 (it serialized after and re-read CONFIRMED) — never a second silent apply.
      const patch = (): request.Test =>
        request(server)
          .patch(`/api/orders/${id}/status`)
          .set('Authorization', `Bearer ${staffToken}`)
          .send({ orderStatus: 'CONFIRMED' });

      const [a, b] = await Promise.all([patch(), patch()]);
      const statuses = [a.status, b.status].sort();

      expect(statuses.filter((s) => s === 200)).toHaveLength(1);
      expect(statuses.some((s) => s === 409 || s === 422)).toBe(true);

      const dbOrder = await prisma.order.findUnique({ where: { id } });
      expect(dbOrder?.orderStatus).toBe('CONFIRMED');
      expect(dbOrder?.updatedById).toBe(staffId);
    });
  });
});
