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
  let freshCustomerId: string;
  let freshToken: string;

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

    // Order creation deducts stock (RN-28): ample quantity so the shared product
    // never runs out or trips a STOCK_ALERT across the suite.
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
        name: 'E2E Customer',
        username,
        passwordHash,
        role: 'CUSTOMER',
        businessUnits: { create: [{ businessUnitId: unit.id }] },
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
        businessUnits: { create: [{ businessUnitId: unit.id }] },
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
        businessUnits: { create: [{ businessUnitId: unit.id }] },
      },
    });
    otherCustomerId = other.id;
    otherToken = await login(otherUsername);

    // A customer that never orders, to prove GET /loyalty/me 404s without an account.
    const freshUsername = `e2e-fresh-${randomUUID()}`;
    const fresh = await prisma.user.create({
      data: {
        name: 'E2E Fresh Customer',
        username: freshUsername,
        passwordHash,
        role: 'CUSTOMER',
        businessUnits: { create: [{ businessUnitId: unit.id }] },
      },
    });
    freshCustomerId = fresh.id;
    freshToken = await login(freshUsername);
  });

  afterAll(async () => {
    const userIds = [customerId, staffId, otherCustomerId, freshCustomerId];
    await prisma.inventoryTransaction.deleteMany({
      where: { inventory: { businessUnitId: unitId } },
    });
    await prisma.inventory.deleteMany({ where: { businessUnitId: unitId } });
    await prisma.loyaltyTransaction.deleteMany({
      where: { loyaltyAccount: { customerId: { in: userIds } } },
    });
    await prisma.loyaltyAccount.deleteMany({ where: { customerId: { in: userIds } } });
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
      // 422 (it serialized after and re-read CONFIRMED) - never a second silent apply.
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

  describe('inventory (RN-27/28/29)', () => {
    // A dedicated product per test: stock checks must not race the shared product.
    const createProductWithStock = async (
      quantity: number,
      minQuantity: number,
    ): Promise<string> => {
      const tag = randomUUID().slice(0, 8);
      const product = await prisma.product.create({
        data: {
          name: `E2E Stock ${tag}`,
          description: 'stock',
          basePrice: '12.50',
          imageUrl: 'https://example.com/stock.jpg',
          categoryId,
          menuItems: {
            create: { businessUnitId: unitId, customPrice: '12.50', isAvailable: true },
          },
        },
      });
      await prisma.inventory.create({
        data: { businessUnitId: unitId, productId: product.id, quantity, minQuantity },
      });
      return product.id;
    };

    const stockOf = async (stockProductId: string): Promise<number | undefined> => {
      const row = await prisma.inventory.findUnique({
        where: {
          businessUnitId_productId: { businessUnitId: unitId, productId: stockProductId },
        },
      });
      return row?.quantity;
    };

    const postOrder = (orderItems: { productId: string; quantity: number }[]): request.Test =>
      request(server)
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({
          businessUnitId: unitId,
          orderChannel: 'APP',
          orderItems: orderItems.map((item) => ({ ...item, unitPrice: '12.50' })),
        });

    it('rejects an order beyond the available stock with 422 and deducts nothing', async () => {
      const stockProductId = await createProductWithStock(1, 0);

      await postOrder([{ productId: stockProductId, quantity: 2 }]).expect(422);

      expect(await stockOf(stockProductId)).toBe(1);
      const movements = await prisma.inventoryTransaction.findMany({
        where: { inventory: { productId: stockProductId } },
      });
      expect(movements).toHaveLength(0);
    });

    it('rejects an order for a product with no inventory row at the unit with 422', async () => {
      const noStockProduct = await prisma.product.create({
        data: {
          name: `E2E NoStock ${randomUUID().slice(0, 8)}`,
          description: 'no stock row',
          basePrice: '12.50',
          imageUrl: 'https://example.com/no-stock.jpg',
          categoryId,
          menuItems: {
            create: { businessUnitId: unitId, customPrice: '12.50', isAvailable: true },
          },
        },
      });

      await postOrder([{ productId: noStockProduct.id, quantity: 1 }]).expect(422);
    });

    it('a valid order decrements the balance and records an OUT InventoryTransaction', async () => {
      const stockProductId = await createProductWithStock(10, 2);

      const res = await postOrder([{ productId: stockProductId, quantity: 3 }]).expect(201);
      const orderId = (res.body as OrderResponseBody).id;

      expect(await stockOf(stockProductId)).toBe(7);
      const movements = await prisma.inventoryTransaction.findMany({
        where: { inventory: { productId: stockProductId } },
      });
      expect(movements).toHaveLength(1);
      expect(movements[0]).toMatchObject({
        type: 'OUT',
        quantity: 3,
        orderId,
        createdBy: customerId,
      });
    });

    it('rolls back every deduction when a later item is out of stock (no partial outflow)', async () => {
      const plentyId = await createProductWithStock(10, 0);
      const scarceId = await createProductWithStock(1, 0);

      await postOrder([
        { productId: plentyId, quantity: 2 },
        { productId: scarceId, quantity: 5 },
      ]).expect(422);

      // Item 1 had stock, but the tx rolled back: nothing went out anywhere.
      expect(await stockOf(plentyId)).toBe(10);
      expect(await stockOf(scarceId)).toBe(1);
      const movements = await prisma.inventoryTransaction.findMany({
        where: { inventory: { productId: { in: [plentyId, scarceId] } } },
      });
      expect(movements).toHaveLength(0);
    });

    it('audits a STOCK_ALERT when the deduction leaves the balance at or below minQuantity', async () => {
      const stockProductId = await createProductWithStock(6, 5);

      await postOrder([{ productId: stockProductId, quantity: 1 }]).expect(201);

      const alerts = await prisma.auditLog.findMany({
        where: { action: 'STOCK_ALERT', entity: 'Inventory', entityId: stockProductId },
      });
      expect(alerts).toHaveLength(1);
      expect(alerts[0].metadata).toMatchObject({
        businessUnitId: unitId,
        productId: stockProductId,
        quantity: 5,
        minQuantity: 5,
      });
    });

    it('GET /inventory/:businessUnitId lists balances to staff and hides them from customers', async () => {
      const res = await request(server)
        .get(`/api/inventory/${unitId}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);

      // GET /inventory is cursor-paginated: rows live under the { data, meta } envelope.
      const body = res.body as {
        data: { productId: string; quantity: number; minQuantity: number }[];
        meta: { nextCursor: string | null; hasMore: boolean };
      };
      expect(body.data.some((row) => row.productId === productId)).toBe(true);
      expect(body.meta).toEqual(expect.objectContaining({ hasMore: expect.any(Boolean) }));

      await request(server)
        .get(`/api/inventory/${unitId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('POST /inventory/:businessUnitId/adjust applies IN and rejects an OUT below zero', async () => {
      const stockProductId = await createProductWithStock(4, 0);

      const inRes = await request(server)
        .post(`/api/inventory/${unitId}/adjust`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ productId: stockProductId, type: 'IN', quantity: 6, reason: 'restock delivery' })
        .expect(201);
      expect((inRes.body as { quantity: number }).quantity).toBe(10);

      await request(server)
        .post(`/api/inventory/${unitId}/adjust`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ productId: stockProductId, type: 'OUT', quantity: 99, reason: 'spoilage' })
        .expect(422);

      expect(await stockOf(stockProductId)).toBe(10);
      const movements = await prisma.inventoryTransaction.findMany({
        where: { inventory: { productId: stockProductId } },
      });
      expect(movements).toHaveLength(1);
      expect(movements[0]).toMatchObject({
        type: 'IN',
        quantity: 6,
        reason: 'restock delivery',
        createdBy: staffId,
        orderId: null,
      });
    });
  });

  describe('loyalty enrollment (RN-30)', () => {
    it('creates the loyalty account on the first order and never duplicates it', async () => {
      await request(server)
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({
          businessUnitId: unitId,
          orderChannel: 'APP',
          orderItems: [{ productId, quantity: 1, unitPrice: '12.50' }],
        })
        .expect(201);

      const account = await prisma.loyaltyAccount.findUnique({ where: { customerId } });
      expect(account).not.toBeNull();
      expect(account?.totalPoints).toBe(0);
      expect(account?.consentGiven).toBe(false);

      await request(server)
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({
          businessUnitId: unitId,
          orderChannel: 'APP',
          orderItems: [{ productId, quantity: 1, unitPrice: '12.50' }],
        })
        .expect(201);

      const accounts = await prisma.loyaltyAccount.findMany({ where: { customerId } });
      expect(accounts).toHaveLength(1);
    });

    it('GET /loyalty/me returns the account to its customer', async () => {
      const res = await request(server)
        .get('/api/loyalty/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const body = res.body as { customerId: string; totalPoints: number; consentGiven: boolean };
      expect(body.customerId).toBe(customerId);
      expect(body.totalPoints).toBe(0);
      expect(body.consentGiven).toBe(false);
    });

    it('GET /loyalty/me 404s for a customer that never ordered', async () => {
      await request(server)
        .get('/api/loyalty/me')
        .set('Authorization', `Bearer ${freshToken}`)
        .expect(404);
    });

    it('GET /loyalty/me forbids staff with 403', async () => {
      await request(server)
        .get('/api/loyalty/me')
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(403);
    });
  });

  describe('GET /orders sorting and cursor', () => {
    interface Page {
      data: OrderResponseBody[];
      meta: { nextCursor: string | null; hasMore: boolean };
    }

    // A price no other test uses, so the total filter isolates exactly these orders
    // from the ones the rest of the suite leaves behind on the shared unit.
    const tiedPrice = '7.77';
    const tiedFilter = `minTotal=${tiedPrice}&maxTotal=${tiedPrice}`;
    const tiedOrderIds: string[] = [];

    beforeAll(async () => {
      const tag = randomUUID().slice(0, 8);
      const product = await prisma.product.create({
        data: {
          name: `E2E Tied ${tag}`,
          description: 'tied totals',
          basePrice: tiedPrice,
          imageUrl: 'https://example.com/tied.jpg',
          categoryId,
          menuItems: {
            create: { businessUnitId: unitId, customPrice: tiedPrice, isAvailable: true },
          },
        },
      });
      await prisma.inventory.create({
        data: { businessUnitId: unitId, productId: product.id, quantity: 100, minQuantity: 0 },
      });

      // Five orders sharing one totalAmount. Combo meals produce ties constantly, and a
      // tie straddling a page boundary is what breaks a cursor lacking a unique
      // tie-break - the fake-repo unit tests cannot reach the real SQL that does it.
      for (let i = 0; i < 5; i += 1) {
        const res = await request(server)
          .post('/api/orders')
          .set('Authorization', `Bearer ${token}`)
          .send({
            businessUnitId: unitId,
            orderChannel: 'APP',
            orderItems: [{ productId: product.id, quantity: 1, unitPrice: tiedPrice }],
          })
          .expect(201);
        tiedOrderIds.push((res.body as OrderResponseBody).id);
      }
    });

    const fetchPage = async (query: string): Promise<Page> => {
      const res = await request(server)
        .get(`/api/orders?${query}`)
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(200);
      return res.body as Page;
    };

    it('pages through tied totalAmount rows without skipping or repeating one', async () => {
      const seen: string[] = [];
      let cursor = '';
      let pages = 0;

      do {
        const paging = cursor === '' ? '' : `&cursor=${encodeURIComponent(cursor)}`;
        const page = await fetchPage(
          `${tiedFilter}&sortBy=totalAmount&sortDir=desc&limit=2${paging}`,
        );
        seen.push(...page.data.map((order) => order.id));
        cursor = page.meta.hasMore ? (page.meta.nextCursor ?? '') : '';
        pages += 1;
      } while (cursor !== '' && pages < 10);

      expect(seen.slice().sort()).toEqual(tiedOrderIds.slice().sort());
      expect(new Set(seen).size).toBe(seen.length);
    });

    it('rejects a cursor replayed under a different sort with 422', async () => {
      const first = await fetchPage(`${tiedFilter}&sortBy=createdAt&sortDir=desc&limit=2`);
      const cursor = first.meta.nextCursor ?? '';
      expect(cursor).not.toBe('');

      await request(server)
        .get(
          `/api/orders?${tiedFilter}&sortBy=totalAmount&sortDir=desc&limit=2` +
            `&cursor=${encodeURIComponent(cursor)}`,
        )
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(422);
    });

    it('rejects a malformed cursor with 422', async () => {
      await request(server)
        .get(`/api/orders?${tiedFilter}&limit=2&cursor=not-a-real-token`)
        .set('Authorization', `Bearer ${staffToken}`)
        .expect(422);
    });

    it('filters by the createdAt range', async () => {
      const past = new Date('2020-01-01T00:00:00.000Z').toISOString();

      const before = await fetchPage(`${tiedFilter}&createdAtTo=${past}&limit=50`);
      expect(before.data).toHaveLength(0);

      const since = await fetchPage(`${tiedFilter}&createdAtFrom=${past}&limit=50`);
      expect(since.data.map((order) => order.id).sort()).toEqual(tiedOrderIds.slice().sort());
    });
  });
});
