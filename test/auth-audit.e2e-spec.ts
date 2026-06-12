import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import type { Server } from 'http';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '@shared/infrastructure/prisma/prisma.service';
import { Argon2PasswordHasher } from '@modules/identity/infrastructure/security/argon2-password-hasher';

describe('Auth + AuditLog (e2e)', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;

  const testUsername = `auditest-${randomUUID()}`;
  const testPassword = 'super-secret-password';
  let testUserId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      providers: [
        {
          provide: APP_PIPE,
          useValue: new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
            transformOptions: { enableImplicitConversion: false },
          }),
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    server = app.getHttpServer() as Server;
    prisma = moduleFixture.get(PrismaService);

    const hasher = new Argon2PasswordHasher();
    const passwordHash = await hasher.hash(testPassword);

    const user = await prisma.user.create({
      data: {
        name: 'Audit Test User',
        username: testUsername,
        passwordHash,
        role: 'KITCHEN',
      },
    });
    testUserId = user.id;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { entity: 'User', entityId: testUserId } });
    await prisma.auditLog.deleteMany({
      where: { entity: 'User', entityId: null, action: 'LOGIN_FAILED' },
    });
    await prisma.user.deleteMany({ where: { id: testUserId } });
    await app.close();
  });

  describe('POST /api/auth/login - success', () => {
    it('writes a LOGIN_SUCCESS audit entry without password/token/cpf in metadata', async () => {
      const response: { body: { access_token: string } } = await request(server)
        .post('/api/auth/login')
        .send({ username: testUsername, password: testPassword })
        .expect(200);

      expect(typeof response.body.access_token).toBe('string');

      const entries = await prisma.auditLog.findMany({
        where: { entity: 'User', entityId: testUserId, action: 'LOGIN_SUCCESS' },
      });
      expect(entries).toHaveLength(1);
      const [entry] = entries;
      expect(entry.userId).toBe(testUserId);

      const serialized = JSON.stringify(entry.metadata);
      expect(serialized).not.toContain(testPassword);
      expect(serialized).not.toContain(response.body.access_token);
      expect(serialized).toContain(testUsername);
    });
  });

  describe('POST /api/auth/login - failure (wrong password)', () => {
    it('writes a LOGIN_FAILED audit entry with the matched userId', async () => {
      await request(server)
        .post('/api/auth/login')
        .send({ username: testUsername, password: 'definitely-wrong-password' })
        .expect(401);

      const entries = await prisma.auditLog.findMany({
        where: { entity: 'User', entityId: testUserId, action: 'LOGIN_FAILED' },
      });
      expect(entries).toHaveLength(1);
      const serialized = JSON.stringify(entries[0].metadata);
      expect(serialized).not.toContain('definitely-wrong-password');
    });
  });

  describe('POST /api/auth/login - failure (unknown user)', () => {
    it('writes a LOGIN_FAILED audit entry with null userId', async () => {
      const ghostUsername = `ghost-${randomUUID()}`;

      await request(server)
        .post('/api/auth/login')
        .send({ username: ghostUsername, password: 'whatever' })
        .expect(401);

      const entries = await prisma.auditLog.findMany({
        where: { entity: 'User', entityId: null, action: 'LOGIN_FAILED' },
      });
      const ours = entries.find(
        (e) =>
          typeof e.metadata === 'object' &&
          e.metadata !== null &&
          (e.metadata as Record<string, unknown>).username === ghostUsername,
      );
      expect(ours).toBeDefined();
      expect(ours?.userId).toBeNull();

      if (ours) {
        await prisma.auditLog.delete({ where: { id: ours.id } });
      }
    });
  });
});
