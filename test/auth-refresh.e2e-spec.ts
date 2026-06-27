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

interface AuthPair {
  access_token: string;
  refresh_token: string;
}

describe('Auth refresh + logout (e2e)', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;

  const username = `e2e-refresh-${randomUUID()}`;
  const password = 'super-secret-password';
  let userId: string;

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
    const passwordHash = await hasher.hash(password);
    const user = await prisma.user.create({
      data: { name: 'Refresh Test User', username, passwordHash, role: 'KITCHEN' },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { entity: 'RefreshToken' } });
    // Cascades to refresh_tokens via the FK.
    await prisma.user.deleteMany({ where: { id: userId } });
    await app.close();
  });

  const login = async (): Promise<AuthPair> => {
    const res = await request(server)
      .post('/api/auth/login')
      .send({ username, password })
      .expect(200);
    return res.body as AuthPair;
  };

  it('rotates: login -> refresh issues a new, different pair', async () => {
    const first = await login();
    expect(typeof first.refresh_token).toBe('string');

    const res = await request(server)
      .post('/api/auth/refresh')
      .send({ refresh_token: first.refresh_token })
      .expect(200);
    const rotated = res.body as AuthPair;

    expect(typeof rotated.access_token).toBe('string');
    expect(typeof rotated.refresh_token).toBe('string');
    expect(rotated.refresh_token).not.toBe(first.refresh_token);
  });

  it('reuse detection: an old (already rotated) refresh token is rejected with 401', async () => {
    const first = await login();

    await request(server)
      .post('/api/auth/refresh')
      .send({ refresh_token: first.refresh_token })
      .expect(200);

    // Re-presenting the now-revoked token is reuse.
    await request(server)
      .post('/api/auth/refresh')
      .send({ refresh_token: first.refresh_token })
      .expect(401);
  });

  it('logout revokes the refresh token so a later refresh fails with 401', async () => {
    const pair = await login();

    await request(server)
      .post('/api/auth/logout')
      .send({ refresh_token: pair.refresh_token })
      .expect(204);

    await request(server)
      .post('/api/auth/refresh')
      .send({ refresh_token: pair.refresh_token })
      .expect(401);
  });

  it('logout is idempotent for an unknown token (204)', async () => {
    await request(server)
      .post('/api/auth/logout')
      .send({ refresh_token: 'never-issued-token' })
      .expect(204);
  });

  it('rejects a malformed body (missing refresh_token) with 400', async () => {
    await request(server).post('/api/auth/refresh').send({}).expect(400);
  });
});
