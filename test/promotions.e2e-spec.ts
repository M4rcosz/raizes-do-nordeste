import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import type { Server } from 'http';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '@shared/infrastructure/prisma/prisma.service';
import { Argon2PasswordHasher } from '@modules/identity/infrastructure/security/argon2-password-hasher';

interface PublicPromotionBody {
  id: string;
  businessUnitId: string;
  name: string;
  discountType: string;
  discountValue: string;
  minOrderValue: string;
  endDate: string;
}

interface PaginatedBody<T> {
  data: T[];
  meta: { limit: number; nextCursor: string | null; hasMore: boolean };
}

/**
 * Covers what the controller unit tests structurally cannot: that the public listing is
 * actually reachable with no Authorization header (the guard pipeline really runs here),
 * and that only currently-valid promotions come back.
 */
describe('Promotions (e2e)', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;

  const password = 'promo-pass';
  let unitId: string;
  let otherUnitId: string;
  let customerId: string;
  let customerToken: string;
  let managerId: string;
  let managerToken: string;

  let activeId: string;
  let expiredId: string;
  let futureId: string;
  let inactiveId: string;
  let otherUnitPromoId: string;

  const publicPath = (unit: string): string => `/api/promotions/public/by-business-unit/${unit}`;

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
        name: `E2E Promo Unit ${tag}`,
        cnpj: `e2e-promo-cnpj-${tag}`,
        address: 'rua e2e',
        city: 'Recife',
        phone: `e2e-promo-phone-${tag}`,
      },
    });
    unitId = unit.id;

    const otherUnit = await prisma.businessUnit.create({
      data: {
        name: `E2E Promo Other ${tag}`,
        cnpj: `e2e-promo-cnpj2-${tag}`,
        address: 'rua e2e 2',
        city: 'Recife',
        phone: `e2e-promo-phone2-${tag}`,
      },
    });
    otherUnitId = otherUnit.id;

    // Dates are pinned relative to now so the window assertions do not rot.
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;

    const makePromo = async (
      name: string,
      startOffset: number,
      endOffset: number,
      isActive: boolean,
      businessUnitId = unitId,
    ): Promise<string> => {
      const row = await prisma.promotion.create({
        data: {
          businessUnitId,
          name,
          discountType: 'PERCENTAGE',
          discountValue: '10.00',
          minOrderValue: '30.00',
          startDate: new Date(now + startOffset),
          endDate: new Date(now + endOffset),
          isActive,
        },
      });
      return row.id;
    };

    activeId = await makePromo('Ativa agora', -day, day, true);
    expiredId = await makePromo('Expirada', -2 * day, -day, true);
    futureId = await makePromo('Futura', day, 2 * day, true);
    inactiveId = await makePromo('Rascunho', -day, day, false);
    otherUnitPromoId = await makePromo('Outra unidade', -day, day, true, otherUnitId);

    const hasher = new Argon2PasswordHasher();
    const passwordHash = await hasher.hash(password);

    const customerUsername = `e2e-promo-customer-${randomUUID()}`;
    const customer = await prisma.user.create({
      data: {
        name: 'E2E Promo Customer',
        username: customerUsername,
        passwordHash,
        role: 'CUSTOMER',
        businessUnits: { create: [{ businessUnitId: unit.id }] },
      },
    });
    customerId = customer.id;

    const managerUsername = `e2e-promo-manager-${randomUUID()}`;
    const manager = await prisma.user.create({
      data: {
        name: 'E2E Promo Manager',
        username: managerUsername,
        passwordHash,
        role: 'MANAGER',
        businessUnits: { create: [{ businessUnitId: unit.id }] },
      },
    });
    managerId = manager.id;

    const login = async (uname: string): Promise<string> => {
      const res: { body: { access_token: string } } = await request(server)
        .post('/api/auth/login')
        .send({ username: uname, password })
        .expect(200);
      return res.body.access_token;
    };

    customerToken = await login(customerUsername);
    managerToken = await login(managerUsername);
  });

  afterAll(async () => {
    const userIds = [customerId, managerId];
    await prisma.promotion.deleteMany({ where: { businessUnitId: { in: [unitId, otherUnitId] } } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.businessUnit.deleteMany({ where: { id: { in: [unitId, otherUnitId] } } });
    await app.close();
  });

  describe('GET /api/promotions/public/by-business-unit/:businessUnitId', () => {
    it('is reachable with no Authorization header at all', async () => {
      // The regression this suite exists for: a class-level UnitScopeGuard would make
      // this 404, because that guard throws when no principal is attached.
      const res = await request(server).get(publicPath(unitId)).expect(200);

      const body = res.body as PaginatedBody<PublicPromotionBody>;
      expect(body.data.map((p) => p.id)).toEqual([activeId]);
    });

    it('returns only the active, in-window promotion of the unit', async () => {
      const res = await request(server).get(publicPath(unitId)).expect(200);

      const ids = (res.body as PaginatedBody<PublicPromotionBody>).data.map((p) => p.id);
      expect(ids).toContain(activeId);
      expect(ids).not.toContain(expiredId);
      expect(ids).not.toContain(futureId);
      expect(ids).not.toContain(inactiveId);
      expect(ids).not.toContain(otherUnitPromoId);
    });

    it('never exposes back-office fields', async () => {
      const res = await request(server).get(publicPath(unitId)).expect(200);

      const [promo] = (res.body as PaginatedBody<PublicPromotionBody>).data;
      expect(Object.keys(promo).sort()).toEqual([
        'businessUnitId',
        'discountType',
        'discountValue',
        'endDate',
        'id',
        'minOrderValue',
        'name',
      ]);
    });

    it('serves a logged-in customer the same page', async () => {
      const res = await request(server)
        .get(publicPath(unitId))
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(200);

      expect((res.body as PaginatedBody<PublicPromotionBody>).data.map((p) => p.id)).toEqual([
        activeId,
      ]);
    });

    it('returns an empty page (not 404) for a unit with no valid promotion', async () => {
      const unknownUnit = randomUUID();
      const res = await request(server).get(publicPath(unknownUnit)).expect(200);

      const body = res.body as PaginatedBody<PublicPromotionBody>;
      expect(body.data).toEqual([]);
      expect(body.meta.hasMore).toBe(false);
    });

    it('rejects a non-uuid businessUnitId with 400', async () => {
      await request(server).get(publicPath('not-a-uuid')).expect(400);
    });

    it('clamps an oversized limit to 100', async () => {
      const res = await request(server)
        .get(`${publicPath(unitId)}?limit=99999`)
        .expect(200);

      expect((res.body as PaginatedBody<PublicPromotionBody>).meta.limit).toBe(100);
    });
  });

  describe('keyset pagination survives the page-1 row leaving the filter', () => {
    let pagedUnitId: string;
    let pagedIds: string[];

    beforeAll(async () => {
      const tag = randomUUID().slice(0, 8);
      const unit = await prisma.businessUnit.create({
        data: {
          name: `E2E Paged ${tag}`,
          cnpj: `e2e-paged-cnpj-${tag}`,
          address: 'rua e2e',
          city: 'Recife',
          phone: `e2e-paged-phone-${tag}`,
        },
      });
      pagedUnitId = unit.id;

      const now = Date.now();
      const day = 24 * 60 * 60 * 1000;
      pagedIds = [];
      // Distinct createdAt values so the (createdAt desc, id desc) order is deterministic.
      for (let i = 0; i < 5; i++) {
        const row = await prisma.promotion.create({
          data: {
            businessUnitId: pagedUnitId,
            name: `paged-${i}`,
            discountType: 'PERCENTAGE',
            discountValue: '10.00',
            minOrderValue: '30.00',
            startDate: new Date(now - day),
            endDate: new Date(now + day),
            isActive: true,
            createdAt: new Date(now - (10 - i) * 1000),
          },
        });
        pagedIds.push(row.id);
      }
    });

    afterAll(async () => {
      await prisma.promotion.deleteMany({ where: { businessUnitId: pagedUnitId } });
      await prisma.businessUnit.deleteMany({ where: { id: pagedUnitId } });
    });

    it('returns every row across two pages when nothing changes', async () => {
      const p1 = await request(server)
        .get(`${publicPath(pagedUnitId)}?limit=3`)
        .expect(200);
      const body1 = p1.body as PaginatedBody<PublicPromotionBody>;
      expect(body1.data).toHaveLength(3);
      expect(body1.meta.hasMore).toBe(true);

      const p2 = await request(server)
        .get(
          `${publicPath(pagedUnitId)}?limit=3&cursor=${encodeURIComponent(body1.meta.nextCursor!)}`,
        )
        .expect(200);
      const body2 = p2.body as PaginatedBody<PublicPromotionBody>;

      const seen = [...body1.data, ...body2.data].map((p) => p.id);
      expect(seen).toHaveLength(5);
      expect(new Set(seen).size).toBe(5);
    });

    it('does not drop a row when the page-1 cursor promotion is deactivated in between', async () => {
      // The measured failure of Prisma's positional cursor: with the cursor row gone
      // from the filtered set, the position shifts and `skip: 1` eats the NEXT row.
      // A keyset predicate compares values, so the row it names need not still match.
      const p1 = await request(server)
        .get(`${publicPath(pagedUnitId)}?limit=3`)
        .expect(200);
      const body1 = p1.body as PaginatedBody<PublicPromotionBody>;
      const cursorRowId = body1.data[body1.data.length - 1].id;

      await prisma.promotion.update({ where: { id: cursorRowId }, data: { isActive: false } });
      try {
        const p2 = await request(server)
          .get(
            `${publicPath(pagedUnitId)}?limit=3&cursor=${encodeURIComponent(body1.meta.nextCursor!)}`,
          )
          .expect(200);

        // The two rows after the cursor must both still arrive.
        const ids = (p2.body as PaginatedBody<PublicPromotionBody>).data.map((p) => p.id);
        expect(ids).toHaveLength(2);
        expect(ids).toEqual(pagedIds.slice(0, 2).reverse());
      } finally {
        await prisma.promotion.update({ where: { id: cursorRowId }, data: { isActive: true } });
      }
    });

    it('rejects a malformed cursor with 422 rather than a 5xx', async () => {
      await request(server)
        .get(`${publicPath(pagedUnitId)}?cursor=garbage`)
        .expect(422);
    });
  });

  describe('back-office listing is unchanged', () => {
    it('still refuses a CUSTOMER token', async () => {
      await request(server)
        .get(`/api/promotions/by-business-unit/${unitId}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .expect(403);
    });

    it('still refuses an anonymous request', async () => {
      await request(server).get(`/api/promotions/by-business-unit/${unitId}`).expect(401);
    });

    it('still shows a MANAGER the inactive and expired rows the public route hides', async () => {
      const res = await request(server)
        .get(`/api/promotions/by-business-unit/${unitId}?limit=100`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);

      const ids = (res.body as PaginatedBody<{ id: string }>).data.map((p) => p.id);
      expect(ids).toEqual(expect.arrayContaining([activeId, expiredId, futureId, inactiveId]));
    });
  });

  describe('FREE_ITEM is refused at the write border', () => {
    const freeItemBody = {
      discountType: 'FREE_ITEM',
      discountValue: '10.00',
      minOrderValue: '30.00',
      startDate: '2026-06-01T00:00:00.000Z',
      endDate: '2026-06-30T00:00:00.000Z',
    };

    it('refuses to create one with 422', async () => {
      await request(server)
        .post('/api/promotions')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ businessUnitId: unitId, name: 'Brinde', ...freeItemBody })
        .expect(422);
    });

    it('refuses to patch an existing promotion into one with 422', async () => {
      await request(server)
        .patch(`/api/promotions/${activeId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ discountType: 'FREE_ITEM' })
        .expect(422);
    });

    it('leaves the promotion untouched after a refused patch', async () => {
      const row = await prisma.promotion.findUnique({ where: { id: activeId } });
      expect(row?.discountType).toBe('PERCENTAGE');
    });
  });
});
