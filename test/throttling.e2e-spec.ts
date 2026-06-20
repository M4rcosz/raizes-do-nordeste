import { afterAll, beforeAll, describe, it } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import type { Server } from 'http';
import request from 'supertest';

// The global throttler reads its ttl/limit from env. We set a tiny limit here
// BEFORE importing AppModule so the test does not depend on the real 100/60s
// budget and stays fast and deterministic. ttl stays large enough that the
// window does not roll over mid-test.
const THROTTLE_LIMIT = 3;
process.env.THROTTLE_LIMIT = String(THROTTLE_LIMIT);
process.env.THROTTLE_TTL_MS = '60000';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { AppModule } = require('../src/app.module') as typeof import('../src/app.module');

describe('Throttling (e2e)', () => {
  let app: INestApplication;
  let server: Server;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    server = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 429 once a public route exceeds the per-IP limit', async () => {
    // The first THROTTLE_LIMIT requests pass, the next one is rejected.
    for (let i = 0; i < THROTTLE_LIMIT; i++) {
      await request(server).get('/api/products').expect(200);
    }

    await request(server).get('/api/products').expect(429);
  });
});
