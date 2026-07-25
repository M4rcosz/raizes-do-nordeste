import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import type { Server } from 'http';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '@shared/infrastructure/prisma/prisma.service';
import { Argon2PasswordHasher } from '@modules/identity/infrastructure/security/argon2-password-hasher';
import { PRODUCT_IMAGE_STORAGE } from '@modules/business-units/application/ports/product-image-storage.port';
import { FakeProductImageStorage } from '@modules/business-units/application/use-cases/__fakes__/product-image-storage.fake';

interface UploadUrlBody {
  signedUrl: string;
  token: string;
  path: string;
  expiresInSeconds: number;
}

interface ProductBody {
  id: string;
  imageUrl: string | null;
}

interface ErrorBody {
  statusCode: number;
  message: string;
}

/**
 * The image flow end to end with everything real except the bucket: guards, the
 * global pipe, the error filter, Prisma and Postgres all run. Only
 * PRODUCT_IMAGE_STORAGE is substituted - it IS the across-process boundary, and a
 * network-dependent e2e would just be a flaky one (CI has no bucket, no key).
 */
describe('Product images (e2e)', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  const storage = new FakeProductImageStorage();

  const password = 'image-pass';
  let categoryId: string;
  let productId: string;
  let otherProductId: string;
  let adminId: string;
  let adminToken: string;
  let customerId: string;
  let customerToken: string;

  const uploadUrlPath = (id: string): string => `/api/products/${id}/image/upload-url`;
  const confirmPath = (id: string): string => `/api/products/${id}/image/confirm`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PRODUCT_IMAGE_STORAGE)
      .useValue(storage)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    server = app.getHttpServer() as Server;
    prisma = moduleFixture.get(PrismaService);

    const tag = randomUUID().slice(0, 8);

    const category = await prisma.category.create({
      data: { name: `E2E Image Cat ${tag}`, description: null },
    });
    categoryId = category.id;

    // Created with NO image: the whole point of the nullable column.
    const product = await prisma.product.create({
      data: { name: `E2E Image Product ${tag}`, basePrice: '10.00', categoryId },
    });
    productId = product.id;

    const otherProduct = await prisma.product.create({
      data: { name: `E2E Image Other ${tag}`, basePrice: '10.00', categoryId },
    });
    otherProductId = otherProduct.id;

    const hasher = new Argon2PasswordHasher();
    const passwordHash = await hasher.hash(password);

    const adminUsername = `e2e-image-admin-${randomUUID()}`;
    const admin = await prisma.user.create({
      data: { name: 'E2E Image Admin', username: adminUsername, passwordHash, role: 'ADMIN' },
    });
    adminId = admin.id;

    const customerUsername = `e2e-image-customer-${randomUUID()}`;
    const customer = await prisma.user.create({
      data: {
        name: 'E2E Image Customer',
        username: customerUsername,
        passwordHash,
        role: 'CUSTOMER',
      },
    });
    customerId = customer.id;

    const login = async (uname: string): Promise<string> => {
      const res: { body: { access_token: string } } = await request(server)
        .post('/api/auth/login')
        .send({ username: uname, password })
        .expect(200);
      return res.body.access_token;
    };

    adminToken = await login(adminUsername);
    customerToken = await login(customerUsername);
  });

  afterAll(async () => {
    const userIds = [adminId, customerId];
    await prisma.product.deleteMany({ where: { id: { in: [productId, otherProductId] } } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  describe('authorization', () => {
    it('rejects the mint route with no Authorization header (401)', async () => {
      await request(server)
        .post(uploadUrlPath(productId))
        .send({ contentType: 'image/png' })
        .expect(401);
    });

    it('rejects the confirm route with no Authorization header (401)', async () => {
      await request(server)
        .post(confirmPath(productId))
        .send({ path: `products/${productId}/${randomUUID()}.png` })
        .expect(401);
    });

    it('rejects a CUSTOMER on the mint route (403)', async () => {
      await request(server)
        .post(uploadUrlPath(productId))
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ contentType: 'image/png' })
        .expect(403);
    });

    it('rejects a CUSTOMER on the confirm route (403)', async () => {
      await request(server)
        .post(confirmPath(productId))
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ path: `products/${productId}/${randomUUID()}.png` })
        .expect(403);
    });
  });

  describe('validation and lookup', () => {
    it('404s the mint route for an unknown product', async () => {
      await request(server)
        .post(uploadUrlPath(randomUUID()))
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contentType: 'image/png' })
        .expect(404);
    });

    it('400s a content type outside the allowlist (the pipe answers first)', async () => {
      await request(server)
        .post(uploadUrlPath(productId))
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contentType: 'image/svg+xml' })
        .expect(400);
    });

    it('404s confirm when nothing was ever uploaded at that path', async () => {
      const res = await request(server)
        .post(confirmPath(productId))
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ path: `products/${productId}/${randomUUID()}.png` })
        .expect(404);

      expect((res.body as ErrorBody).statusCode).toBe(404);
    });

    // The IDOR guard, driven through the real pipeline: a well-formed path for
    // another product must not be confirmable onto this one.
    it('422s confirm when the path is scoped to a different product', async () => {
      const foreignPath = `products/${otherProductId}/${randomUUID()}.png`;
      storage.putObject(foreignPath, { sizeBytes: 1024, contentType: 'image/png' });

      await request(server)
        .post(confirmPath(productId))
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ path: foreignPath })
        .expect(422);

      const row = await prisma.product.findUnique({ where: { id: productId } });
      expect(row?.imageUrl).toBeNull();
    });

    it('422s confirm on a malformed path', async () => {
      await request(server)
        .post(confirmPath(productId))
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ path: `products/${productId}/../etc/passwd` })
        .expect(422);
    });
  });

  describe('product serialisation', () => {
    it('ships imageUrl as null (key present) for a product with no image', async () => {
      const res = await request(server).get(`/api/products/${productId}`).expect(200);

      const body = res.body as ProductBody;
      expect(body.imageUrl).toBeNull();
      expect(Object.keys(body)).toContain('imageUrl');
    });
  });

  describe('happy path', () => {
    it('mints, uploads, confirms and publishes the public URL', async () => {
      const mint = await request(server)
        .post(uploadUrlPath(productId))
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contentType: 'image/jpeg' })
        .expect(201);

      const upload = mint.body as UploadUrlBody;
      expect(upload.path).toMatch(new RegExp(`^products/${productId}/[0-9a-f-]{36}\\.jpg$`));
      expect(upload.expiresInSeconds).toBe(7200);
      expect(upload.token).toBeTruthy();

      // Stands in for the client's PUT to the signed URL.
      storage.putObject(upload.path, { sizeBytes: 2048, contentType: 'image/jpeg' });

      const confirmed = await request(server)
        .post(confirmPath(productId))
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ path: upload.path })
        .expect(200);

      const expectedUrl = storage.publicUrl(upload.path);
      expect((confirmed.body as ProductBody).imageUrl).toBe(expectedUrl);

      const fetched = await request(server).get(`/api/products/${productId}`).expect(200);
      expect((fetched.body as ProductBody).imageUrl).toBe(expectedUrl);
    });

    it('replaces the image and deletes the object it replaced', async () => {
      const previousUrl = (await prisma.product.findUnique({ where: { id: productId } }))?.imageUrl;
      expect(previousUrl).toBeTruthy();

      const mint = await request(server)
        .post(uploadUrlPath(productId))
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contentType: 'image/webp' })
        .expect(201);

      const upload = mint.body as UploadUrlBody;
      storage.putObject(upload.path, { sizeBytes: 4096, contentType: 'image/webp' });

      await request(server)
        .post(confirmPath(productId))
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ path: upload.path })
        .expect(200);

      expect(storage.has(upload.path)).toBe(true);
      // The previous object is gone from the bucket, not merely unreferenced.
      expect(storage.removedPaths.length).toBeGreaterThan(0);
      const removed = storage.removedPaths[storage.removedPaths.length - 1];
      expect(previousUrl).toBe(storage.publicUrl(removed));
    });

    it('422s confirm when the stored object breaks the type policy', async () => {
      const mint = await request(server)
        .post(uploadUrlPath(productId))
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contentType: 'image/png' })
        .expect(201);

      const upload = mint.body as UploadUrlBody;
      // The client PUT something else entirely behind the signed URL.
      storage.putObject(upload.path, { sizeBytes: 512, contentType: 'text/html' });

      await request(server)
        .post(confirmPath(productId))
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ path: upload.path })
        .expect(422);
    });

    it('records the change in the audit log', async () => {
      const entries = await prisma.auditLog.findMany({
        where: { userId: adminId, action: 'PRODUCT_IMAGE_UPDATED' },
      });

      expect(entries.length).toBeGreaterThan(0);
      expect(entries[0].entityId).toBe(productId);
    });
  });
});
