import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import type { Server } from 'http';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '@shared/infrastructure/prisma/prisma.service';

interface PaginatedBody<T> {
  data: T[];
  meta: { limit: number; nextCursor: string | null; hasMore: boolean };
}

interface PublicMenuItemBody {
  menuItemId: string;
  productId: string;
}

interface ProductBody {
  id: string;
}

/**
 * The catalog listings are the sharpest case for a keyset cursor anywhere in the app:
 * their WHERE is built entirely from toggleable flags. The public menu filters on THREE
 * at once (isAvailable, product.isActive, businessUnit.isActive), so under Prisma's
 * positional cursor a single flag flip between two page requests shifted the position
 * and `skip: 1` silently returned a short menu - no error, no signal.
 *
 * Only an e2e can catch this: the repo unit specs mock PrismaService, so they assert the
 * arguments handed to Prisma, never what Postgres does with them.
 */
describe('Catalog pagination (e2e)', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;

  let unitId: string;
  let categoryId: string;
  /** Oldest first. The listings sort newest first, so pages walk these backwards. */
  let productIds: string[];
  let menuItemIds: string[];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    server = app.getHttpServer() as Server;
    prisma = app.get(PrismaService);

    const tag = randomUUID().slice(0, 8);

    const unit = await prisma.businessUnit.create({
      data: {
        name: `E2E Catalog ${tag}`,
        cnpj: `e2e-cat-cnpj-${tag}`,
        address: 'rua e2e',
        city: 'Recife',
        phone: `e2e-cat-phone-${tag}`,
      },
    });
    unitId = unit.id;

    const category = await prisma.category.create({
      data: { name: `E2E Catalog Cat ${tag}`, description: null },
    });
    categoryId = category.id;

    const now = Date.now();
    productIds = [];
    menuItemIds = [];
    // Distinct createdAt values so (createdAt desc, id desc) is deterministic.
    for (let i = 0; i < 5; i++) {
      const product = await prisma.product.create({
        data: {
          name: `E2E Catalog Product ${tag}-${i}`,
          description: null,
          basePrice: '10.00',
          imageUrl: 'https://example.com/p.jpg',
          categoryId,
          isActive: true,
          createdAt: new Date(now - (10 - i) * 1000),
        },
      });
      productIds.push(product.id);

      const item = await prisma.businessUnitMenuItem.create({
        data: {
          businessUnitId: unitId,
          productId: product.id,
          customPrice: '12.00',
          isAvailable: true,
          createdAt: new Date(now - (10 - i) * 1000),
        },
      });
      menuItemIds.push(item.id);
    }
  });

  afterAll(async () => {
    await prisma.businessUnitMenuItem.deleteMany({ where: { businessUnitId: unitId } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.businessUnit.deleteMany({ where: { id: unitId } });
    await app.close();
  });

  describe('GET /api/products/by-business-unit/:businessUnitId', () => {
    const path = (): string => `/api/products/by-business-unit/${unitId}`;

    it('returns every row across two pages when nothing changes', async () => {
      const p1 = await request(server).get(`${path()}?limit=3`).expect(200);
      const body1 = p1.body as PaginatedBody<ProductBody>;
      expect(body1.data).toHaveLength(3);
      expect(body1.meta.hasMore).toBe(true);

      const p2 = await request(server)
        .get(`${path()}?limit=3&cursor=${encodeURIComponent(body1.meta.nextCursor!)}`)
        .expect(200);
      const body2 = p2.body as PaginatedBody<ProductBody>;

      const seen = [...body1.data, ...body2.data].map((p) => p.id);
      expect(seen).toHaveLength(5);
      expect(new Set(seen).size).toBe(5);
      expect([...seen].sort()).toEqual([...productIds].sort());
    });

    it('does not drop a row when the cursor product leaves the filter between pages', async () => {
      const p1 = await request(server).get(`${path()}?limit=3`).expect(200);
      const body1 = p1.body as PaginatedBody<ProductBody>;
      const cursorProductId = body1.data[body1.data.length - 1].id;

      // Pull the cursor's product off this unit's menu. Under a positional cursor the
      // page-2 position now resolves one row further along and `skip: 1` eats the next
      // product outright.
      await prisma.businessUnitMenuItem.updateMany({
        where: { businessUnitId: unitId, productId: cursorProductId },
        data: { isAvailable: false },
      });
      try {
        const p2 = await request(server)
          .get(`${path()}?limit=3&cursor=${encodeURIComponent(body1.meta.nextCursor!)}`)
          .expect(200);
        const ids = (p2.body as PaginatedBody<ProductBody>).data.map((p) => p.id);

        // Both products after the cursor must still arrive.
        expect(ids).toHaveLength(2);
        expect(ids).toEqual([...productIds].slice(0, 2).reverse());
      } finally {
        await prisma.businessUnitMenuItem.updateMany({
          where: { businessUnitId: unitId, productId: cursorProductId },
          data: { isAvailable: true },
        });
      }
    });
  });

  describe('GET /api/business-units/:businessUnitId/menu', () => {
    const path = (): string => `/api/business-units/${unitId}/menu`;

    it('returns every row across two pages when nothing changes', async () => {
      const p1 = await request(server).get(`${path()}?limit=3`).expect(200);
      const body1 = p1.body as PaginatedBody<PublicMenuItemBody>;
      expect(body1.data).toHaveLength(3);
      expect(body1.meta.hasMore).toBe(true);

      const p2 = await request(server)
        .get(`${path()}?limit=3&cursor=${encodeURIComponent(body1.meta.nextCursor!)}`)
        .expect(200);
      const body2 = p2.body as PaginatedBody<PublicMenuItemBody>;

      const seen = [...body1.data, ...body2.data].map((m) => m.menuItemId);
      expect(seen).toHaveLength(5);
      expect(new Set(seen).size).toBe(5);
      expect([...seen].sort()).toEqual([...menuItemIds].sort());
    });

    it('does not drop a row when the cursor item is made unavailable between pages', async () => {
      const p1 = await request(server).get(`${path()}?limit=3`).expect(200);
      const body1 = p1.body as PaginatedBody<PublicMenuItemBody>;
      const cursorItemId = body1.data[body1.data.length - 1].menuItemId;

      await prisma.businessUnitMenuItem.update({
        where: { id: cursorItemId },
        data: { isAvailable: false },
      });
      try {
        const p2 = await request(server)
          .get(`${path()}?limit=3&cursor=${encodeURIComponent(body1.meta.nextCursor!)}`)
          .expect(200);
        const ids = (p2.body as PaginatedBody<PublicMenuItemBody>).data.map((m) => m.menuItemId);

        expect(ids).toHaveLength(2);
        expect(ids).toEqual([...menuItemIds].slice(0, 2).reverse());
      } finally {
        await prisma.businessUnitMenuItem.update({
          where: { id: cursorItemId },
          data: { isAvailable: true },
        });
      }
    });

    it('does not drop a row when the cursor item PRODUCT is deactivated between pages', async () => {
      // The second of the three flags. A product deactivated brand-wide pulls its menu
      // row out of the public view just as effectively as unsetting isAvailable, and it
      // is a different table - the keyset has to be immune to both.
      const p1 = await request(server).get(`${path()}?limit=3`).expect(200);
      const body1 = p1.body as PaginatedBody<PublicMenuItemBody>;
      const cursorProductId = body1.data[body1.data.length - 1].productId;

      await prisma.product.update({ where: { id: cursorProductId }, data: { isActive: false } });
      try {
        const p2 = await request(server)
          .get(`${path()}?limit=3&cursor=${encodeURIComponent(body1.meta.nextCursor!)}`)
          .expect(200);
        const ids = (p2.body as PaginatedBody<PublicMenuItemBody>).data.map((m) => m.menuItemId);

        expect(ids).toHaveLength(2);
        expect(ids).toEqual([...menuItemIds].slice(0, 2).reverse());
      } finally {
        await prisma.product.update({ where: { id: cursorProductId }, data: { isActive: true } });
      }
    });

    it('rejects a malformed cursor with 422 instead of silently restarting at page 1', async () => {
      // A garbage token must not read as "start over": the client would page forever.
      await request(server).get(`${path()}?limit=3&cursor=not-a-real-token`).expect(422);
    });

    it('rejects an over-long cursor at the DTO border, before any decoding', async () => {
      // MAX_CURSOR_LENGTH. Issued tokens are ~112 chars; the cap stops an unauthenticated
      // caller making the server base64-decode and JSON.parse a multi-KB blob per request.
      // 400 (validation) rather than 422 (codec) because it never reaches the codec.
      await request(server)
        .get(`${path()}?limit=3&cursor=${'a'.repeat(600)}`)
        .expect(400);
    });
  });
});
