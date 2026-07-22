import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import type { Server } from 'http';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '@shared/infrastructure/prisma/prisma.service';
import { Argon2PasswordHasher } from '@modules/identity/infrastructure/security/argon2-password-hasher';

interface PaginatedBody<T> {
  data: T[];
  meta: { limit: number; nextCursor: string | null; hasMore: boolean };
}

/**
 * Walks page 1 -> page 2 on the two ADMIN listings, feeding `meta.nextCursor` straight
 * back the way the API tells clients to.
 *
 * This is the gap that let a real break ship: the controller specs build the query DTO by
 * hand and call the method directly, so the global ValidationPipe never runs, and no e2e
 * paged these two routes. Both listings kept an `@IsUUID()` cursor validator after the
 * keyset migration made the cursor a base64url token, so every page after the first was
 * a 400 - green unit suite, endpoint unusable.
 */
describe('Admin listing pagination (e2e)', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;

  const password = 'admin-paging-pass';
  let adminToken: string;
  let createdUserIds: string[];
  const tag = randomUUID().slice(0, 8);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    server = app.getHttpServer() as Server;
    prisma = moduleFixture.get(PrismaService);

    const hasher = new Argon2PasswordHasher();
    const passwordHash = await hasher.hash(password);

    createdUserIds = [];
    const admin = await prisma.user.create({
      data: {
        name: `Paging Admin ${tag}`,
        username: `pagingadmin${tag}`,
        passwordHash,
        role: 'ADMIN',
      },
    });
    createdUserIds.push(admin.id);

    // Enough rows that a limit of 2 leaves a second page.
    const now = Date.now();
    for (let i = 0; i < 4; i++) {
      const user = await prisma.user.create({
        data: {
          name: `Paging Staff ${tag}-${i}`,
          username: `pagingstaff${tag}x${i}`,
          passwordHash,
          role: 'KITCHEN',
          createdAt: new Date(now - (10 - i) * 1000),
        },
      });
      createdUserIds.push(user.id);
    }

    const res: { body: { access_token: string } } = await request(server)
      .post('/api/auth/login')
      .send({ username: `pagingadmin${tag}`, password })
      .expect(200);
    adminToken = res.body.access_token;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await app.close();
  });

  describe('GET /api/users', () => {
    it('accepts its own nextCursor and returns the next page', async () => {
      const p1 = await request(server)
        .get('/api/users?limit=2')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const body1 = p1.body as PaginatedBody<{ id: string }>;
      expect(body1.data).toHaveLength(2);
      expect(body1.meta.hasMore).toBe(true);
      expect(body1.meta.nextCursor).not.toBeNull();

      // Fed back verbatim, exactly as an integrator following the API would.
      const p2 = await request(server)
        .get(`/api/users?limit=2&cursor=${encodeURIComponent(body1.meta.nextCursor!)}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const body2 = p2.body as PaginatedBody<{ id: string }>;

      expect(body2.data.length).toBeGreaterThan(0);
      const seen = [...body1.data, ...body2.data].map((u) => u.id);
      expect(new Set(seen).size).toBe(seen.length);
    });

    it('rejects a malformed cursor with 422, not 400', async () => {
      // 422 is the cursor codec's answer. A 400 here means a DTO validator is still
      // second-guessing the token format.
      await request(server)
        .get('/api/users?limit=2&cursor=not-a-real-token')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(422);
    });
  });

  describe('GET /api/audit-logs', () => {
    it('accepts its own nextCursor and returns the next page', async () => {
      const p1 = await request(server)
        .get('/api/audit-logs?limit=2')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const body1 = p1.body as PaginatedBody<{ id: string }>;
      expect(body1.meta.hasMore).toBe(true);
      expect(body1.meta.nextCursor).not.toBeNull();

      const p2 = await request(server)
        .get(`/api/audit-logs?limit=2&cursor=${encodeURIComponent(body1.meta.nextCursor!)}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const body2 = p2.body as PaginatedBody<{ id: string }>;

      expect(body2.data.length).toBeGreaterThan(0);
      const seen = [...body1.data, ...body2.data].map((l) => l.id);
      expect(new Set(seen).size).toBe(seen.length);
    });

    it('rejects a malformed cursor with 422, not 400', async () => {
      await request(server)
        .get('/api/audit-logs?limit=2&cursor=not-a-real-token')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(422);
    });
  });
});
