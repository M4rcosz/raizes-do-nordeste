import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import type { Server } from 'http';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import {
  ProductRepository,
  PRODUCT_REPOSITORY,
} from '@modules/business-units/domain/repositories/product.repository';

/**
 * Drives a real failure through the full Nest pipeline (global APP_FILTER)
 * by swapping the product repository for one that always throws.
 */
describe('GlobalErrorFilter (e2e)', () => {
  let app: INestApplication;
  let server: Server;

  const throwingRepository: ProductRepository = {
    findById: () => Promise.reject(new Error('SECRET: db credentials in stack')),
    findAllActive: () => Promise.reject(new Error('SECRET: db credentials in stack')),
    findAllByBusinessUnit: () => Promise.reject(new Error('SECRET: db credentials in stack')),
    create: () => Promise.reject(new Error('SECRET: db credentials in stack')),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PRODUCT_REPOSITORY)
      .useValue(throwingRepository)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    server = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  it('translates a repository failure into a 503 envelope without leaking internals', async () => {
    const response = await request(server).get('/api/products').expect(503);

    expect(response.body).toEqual({
      statusCode: 503,
      error: 'Service Unavailable',
      message: 'Could not retrieve active products.',
      path: '/api/products',
      timestamp: expect.any(String),
    });
    expect(JSON.stringify(response.body)).not.toContain('SECRET');
  });
});
