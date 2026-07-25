import { beforeEach, describe, expect, it } from '@jest/globals';
import { Money } from '@shared/domain/value-objects/money';
import { ERROR_KINDS } from '@shared/errors/errors.type';
import { CreateProductImageUploadUrlUseCase } from './create-product-image-upload-url.use-case';
import { FakeProductImageStorage } from './__fakes__/product-image-storage.fake';
import { Product } from '../../domain/entities/product.entity';
import type {
  CreateProductInput,
  FindProductsByBusinessUnitInput,
  FindProductsInput,
  ProductRepository,
} from '../../domain/repositories/product.repository';
import { ProductImageStorageError } from '../errors/product-image-storage.error';
import { ProductNotFoundError } from '../errors/product-not-found.error';

const PRODUCT_ID = '550e8400-e29b-41d4-a716-446655440000';

// In-memory fake. Every write path counts its calls so the "mints nothing into
// the DB" guarantee is observable.
class FakeProductRepository implements ProductRepository {
  readonly store = new Map<string, Product>();
  writes = 0;

  seed(product: Product): void {
    this.store.set(product.id, product);
  }

  findById(id: string): Promise<Product | null> {
    return Promise.resolve(this.store.get(id) ?? null);
  }

  findAllByBusinessUnit(_input: FindProductsByBusinessUnitInput): Promise<Product[]> {
    return Promise.reject(new Error('not used'));
  }

  findAllActive(_input: FindProductsInput): Promise<Product[]> {
    return Promise.reject(new Error('not used'));
  }

  create(_input: CreateProductInput): Promise<Product> {
    this.writes++;
    return Promise.reject(new Error('not used'));
  }

  update(_product: Product): Promise<Product | null> {
    this.writes++;
    return Promise.reject(new Error('not used'));
  }

  setActive(): Promise<Product | null> {
    this.writes++;
    return Promise.reject(new Error('not used'));
  }

  setImageUrl(): Promise<Product | null> {
    this.writes++;
    return Promise.reject(new Error('not used'));
  }
}

const buildProduct = (imageUrl: string | null = null): Product =>
  new Product(
    PRODUCT_ID,
    'Acarajé',
    'Original',
    Money.fromDecimalString('18.50'),
    true,
    'category-1',
    new Date('2026-01-01T00:00:00Z'),
    new Date('2026-01-02T00:00:00Z'),
    imageUrl,
  );

describe('CreateProductImageUploadUrlUseCase', () => {
  let repo: FakeProductRepository;
  let storage: FakeProductImageStorage;
  let useCase: CreateProductImageUploadUrlUseCase;

  beforeEach(() => {
    repo = new FakeProductRepository();
    storage = new FakeProductImageStorage();
    useCase = new CreateProductImageUploadUrlUseCase(repo, storage);
  });

  it('throws ProductNotFoundError for an unknown product', async () => {
    await expect(
      useCase.execute({ productId: 'ghost', contentType: 'image/png' }),
    ).rejects.toBeInstanceOf(ProductNotFoundError);
    expect(storage.signedPaths).toHaveLength(0);
  });

  it('mints a signed upload under the product prefix with the right extension', async () => {
    repo.seed(buildProduct());

    const result = await useCase.execute({ productId: PRODUCT_ID, contentType: 'image/webp' });

    expect(result.path).toMatch(new RegExp(`^products/${PRODUCT_ID}/[0-9a-f-]{36}\\.webp$`));
    expect(result.signedUrl).toContain(result.path);
    expect(result.token).toBeTruthy();
    expect(result.expiresInSeconds).toBe(7200);
    expect(storage.signedPaths).toEqual([result.path]);
  });

  it('writes nothing to the repository', async () => {
    repo.seed(buildProduct('https://cdn.example.com/old.jpg'));

    await useCase.execute({ productId: PRODUCT_ID, contentType: 'image/png' });

    expect(repo.writes).toBe(0);
    // The stored URL is untouched until confirm runs.
    expect(repo.store.get(PRODUCT_ID)?.imageUrl).toBe('https://cdn.example.com/old.jpg');
  });

  // A per-call object name is what makes replacement cache-safe: the new image
  // gets a brand new URL instead of fighting the CDN copy of the old one.
  it('yields a different path on every call', async () => {
    repo.seed(buildProduct());

    const first = await useCase.execute({ productId: PRODUCT_ID, contentType: 'image/png' });
    const second = await useCase.execute({ productId: PRODUCT_ID, contentType: 'image/png' });

    expect(first.path).not.toBe(second.path);
  });

  it('wraps a storage failure in ProductImageStorageError (503), preserving the cause', async () => {
    repo.seed(buildProduct());
    const boom = new Error('bucket exploded');
    storage.failure = boom;

    const error = await useCase
      .execute({ productId: PRODUCT_ID, contentType: 'image/png' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ProductImageStorageError);
    expect((error as ProductImageStorageError).kind).toBe(ERROR_KINDS.UNAVAILABLE);
    expect((error as ProductImageStorageError).cause).toBe(boom);
    expect((error as Error).message).not.toContain('bucket exploded');
  });
});
