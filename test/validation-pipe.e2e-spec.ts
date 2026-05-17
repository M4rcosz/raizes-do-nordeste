import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import type { Server } from 'http';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Proves the global ValidationPipe (registered as APP_PIPE in AppModule)
 * is active across the full Nest pipeline:
 *  - extra/unknown properties  -> 400 (forbidNonWhitelisted)
 *  - wrong types               -> 400 (type validation, explicit @Type only)
 *  - well-formed payloads      -> pass through to the use-case
 *
 * The pipe is asserted through real HTTP, NOT by calling controllers
 * directly, because validation only runs in the HTTP pipeline.
 *
 * transformOptions.enableImplicitConversion is OFF by design: conversion
 * is opt-in per field via @Type(). So a non-string in a @IsString field
 * is NOT coerced and is rejected with 400 (see the username test).
 */
describe('ValidationPipe (e2e)', () => {
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

  describe('forbidNonWhitelisted — unknown properties rejected', () => {
    it('rejects a login body carrying an extra field (400)', async () => {
      // username/password are valid on their own, so 400 is caused
      // *only* by the unknown `role` field -> proves forbidNonWhitelisted.
      await request(server)
        .post('/api/auth/login')
        .send({ username: 'someone', password: 'supersecret', role: 'ADMIN' })
        .expect(400);
    });

    it('rejects an unknown query param on the products list (400)', async () => {
      await request(server).get('/api/products?foo=bar').expect(400);
    });
  });

  describe('type validation — wrong types rejected', () => {
    // DoD: "string in a number field -> 400". @Type(() => Number) coerces
    // "abc" -> NaN, then @IsInt fails.
    it('rejects a non-numeric "limit" query param (400)', async () => {
      await request(server).get('/api/products?limit=abc').expect(400);
    });

    // With enableImplicitConversion OFF and no @Type on username, 12345
    // stays a number, so @IsString rejects it -> 400. Under implicit
    // conversion this would be stringified first and slip through.
    it('rejects a non-string username in the login body (400)', async () => {
      await request(server)
        .post('/api/auth/login')
        .send({ username: 12345, password: 'supersecret' })
        .expect(400);
    });

    it('rejects a malformed UUID path param (400)', async () => {
      await request(server).get('/api/products/not-a-uuid').expect(400);
    });
  });

  describe('valid payloads pass the pipe', () => {
    it('accepts the products list with no query params (200)', async () => {
      await request(server).get('/api/products').expect(200);
    });

    it('coerces a valid numeric "limit" via explicit @Type (200)', async () => {
      // Proves @Type(() => Number) still converts the query string with
      // implicit conversion OFF — @Type is now load-bearing, not redundant.
      await request(server).get('/api/products?limit=5').expect(200);
    });

    it('clamps an out-of-range "limit" instead of rejecting it (200)', async () => {
      // By design: limit bounds are clamped by sanitizeLimit, not
      // rejected by @Max. ?limit=99999 -> clamped to MAX_LIMIT, 200.
      await request(server).get('/api/products?limit=99999').expect(200);
    });

    it('lets a well-formed login through to the use-case (not 400)', async () => {
      // Unknown user -> the use-case rejects it (401), but the request
      // reached the use-case at all, proving the pipe let it through.
      const response = await request(server)
        .post('/api/auth/login')
        .send({ username: 'nonexistent-user', password: 'supersecret' });

      expect(response.status).not.toBe(400);
    });
  });
});
