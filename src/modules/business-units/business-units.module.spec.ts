import { afterEach, describe, expect, it } from '@jest/globals';
import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@shared/infrastructure/prisma/prisma.module';
import { BusinessUnitsModule } from './business-units.module';
import { PRODUCT_IMAGE_STORAGE } from './application/ports/product-image-storage.port';
import { CreateProductImageUploadUrlUseCase } from './application/use-cases/create-product-image-upload-url.use-case';
import {
  ConfirmProductImageUploadUseCase,
  DEFAULT_PRODUCT_IMAGE_MAX_BYTES,
  PRODUCT_IMAGE_MAX_BYTES,
} from './application/use-cases/confirm-product-image-upload.use-case';

/**
 * Boots the module graph (compile only - no DB connection, no storage call) to
 * prove every provider resolves. Nothing else catches this: the image storage
 * adapter depends on ConfigService, and a missing wire passes `npm run build`
 * and every unit test, then explodes at container boot.
 */
describe('BusinessUnitsModule', () => {
  // Closed in afterEach, not inline: a failing assertion would otherwise leak the
  // module and can hang the Jest worker.
  let moduleRef: TestingModule | undefined;

  afterEach(async () => {
    await moduleRef?.close();
    moduleRef = undefined;
  });

  const build = async (): Promise<TestingModule> => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, BusinessUnitsModule],
    }).compile();
    return moduleRef;
  };

  it('resolves the product image storage adapter and both image use cases', async () => {
    const ref = await build();

    expect(ref.get(PRODUCT_IMAGE_STORAGE)).toBeDefined();
    expect(ref.get(CreateProductImageUploadUrlUseCase)).toBeDefined();
    expect(ref.get(ConfirmProductImageUploadUseCase)).toBeDefined();
  });

  it('resolves the image size cap as a positive number', async () => {
    const ref = await build();

    const maxBytes = ref.get<number>(PRODUCT_IMAGE_MAX_BYTES);
    expect(typeof maxBytes).toBe('number');
    expect(maxBytes).toBeGreaterThan(0);
    // Unset in the test env, so the wiring default is what comes back.
    expect(maxBytes).toBe(
      process.env.SUPABASE_IMAGE_MAX_BYTES
        ? Number(process.env.SUPABASE_IMAGE_MAX_BYTES)
        : DEFAULT_PRODUCT_IMAGE_MAX_BYTES,
    );
  });
});
