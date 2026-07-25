import { beforeEach, describe, expect, it } from '@jest/globals';
import { Money } from '@shared/domain/value-objects/money';
import { ERROR_KINDS } from '@shared/errors/errors.type';
import type {
  AuditLogInput,
  AuditLogger,
} from '@modules/audit/application/ports/audit-logger.port';
import { AUDIT_ACTIONS } from '@modules/audit/domain/audit-actions';
import type { StoredObjectInfo } from '@modules/business-units/application/ports/product-image-storage.port';
import { ConfirmProductImageUploadUseCase } from './confirm-product-image-upload.use-case';
import { FakeProductImageStorage } from './__fakes__/product-image-storage.fake';
import { Product } from '../../domain/entities/product.entity';
import type {
  CreateProductInput,
  FindProductsByBusinessUnitInput,
  FindProductsInput,
  ProductRepository,
} from '../../domain/repositories/product.repository';
import { ProductImagePath } from '../../domain/value-objects/product-image-path';
import { InvalidProductImagePathError } from '../../domain/errors/invalid-product-image-path.error';
import { InvalidProductImageError } from '../errors/invalid-product-image.error';
import { ProductImageNotUploadedError } from '../errors/product-image-not-uploaded.error';
import { ProductImageStorageError } from '../errors/product-image-storage.error';
import { ProductNotFoundError } from '../errors/product-not-found.error';

const PRODUCT_ID = '550e8400-e29b-41d4-a716-446655440000';
const OTHER_PRODUCT_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const TOKEN = 'f81d4fae-7dec-41d0-a765-00a0c91e6bf6';
const OLD_TOKEN = '9b2e4c1a-3d5f-42a8-b9c7-1e0f2a3b4c5d';
const MAX_BYTES = 5_000_000;

const path = `products/${PRODUCT_ID}/${TOKEN}.png`;
const oldPath = `products/${PRODUCT_ID}/${OLD_TOKEN}.png`;
const foreignPath = `products/${OTHER_PRODUCT_ID}/${TOKEN}.png`;

class FakeProductRepository implements ProductRepository {
  readonly store = new Map<string, Product>();
  readonly imageWrites: { id: string; imageUrl: string | null }[] = [];
  setImageUrlReturnsNull = false;

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
    return Promise.reject(new Error('not used'));
  }

  update(_product: Product): Promise<Product | null> {
    return Promise.reject(new Error('not used'));
  }

  setActive(): Promise<Product | null> {
    return Promise.reject(new Error('not used'));
  }

  setImageUrl(id: string, imageUrl: string | null): Promise<Product | null> {
    this.imageWrites.push({ id, imageUrl });
    if (this.setImageUrlReturnsNull) {
      return Promise.resolve(null);
    }
    const current = this.store.get(id);
    if (!current) {
      return Promise.resolve(null);
    }
    const updated = new Product(
      current.id,
      current.name,
      current.description,
      current.price,
      current.isActive,
      current.categoryId,
      current.createdAt,
      current.updatedAt,
      imageUrl,
    );
    this.store.set(id, updated);
    return Promise.resolve(updated);
  }
}

class FakeAuditLogger implements AuditLogger {
  readonly entries: AuditLogInput[] = [];

  log(input: AuditLogInput): Promise<void> {
    this.entries.push(input);
    return Promise.resolve();
  }
}

const buildProduct = (imageUrl: string | null = null, id = PRODUCT_ID): Product =>
  new Product(
    id,
    'Acarajé',
    'Original',
    Money.fromDecimalString('18.50'),
    true,
    'category-1',
    new Date('2026-01-01T00:00:00Z'),
    new Date('2026-01-02T00:00:00Z'),
    imageUrl,
  );

describe('ConfirmProductImageUploadUseCase', () => {
  let repo: FakeProductRepository;
  let storage: FakeProductImageStorage;
  let audit: FakeAuditLogger;
  let useCase: ConfirmProductImageUploadUseCase;

  const confirm = (raw = path): Promise<Product> =>
    useCase.execute({ productId: PRODUCT_ID, path: raw, actorId: 'admin-1' });

  beforeEach(() => {
    repo = new FakeProductRepository();
    storage = new FakeProductImageStorage();
    audit = new FakeAuditLogger();
    useCase = new ConfirmProductImageUploadUseCase(repo, storage, MAX_BYTES, audit);
  });

  it('throws ProductNotFoundError (404) for an unknown product', async () => {
    const error = await useCase
      .execute({ productId: 'ghost', path, actorId: 'admin-1' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ProductNotFoundError);
    expect((error as ProductNotFoundError).kind).toBe(ERROR_KINDS.NOT_FOUND);
  });

  // The IDOR test. A perfectly well-formed path that belongs to a different
  // product must die before anything is read or written.
  it('rejects a well-formed path scoped to another product without writing', async () => {
    repo.seed(buildProduct());
    storage.putObject(foreignPath, { sizeBytes: 1000, contentType: 'image/png' });

    const error = await confirm(foreignPath).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(InvalidProductImagePathError);
    expect((error as InvalidProductImagePathError).kind).toBe(ERROR_KINDS.INVALID);
    expect(repo.imageWrites).toHaveLength(0);
    expect(storage.has(foreignPath)).toBe(true);
  });

  it('throws ProductImageNotUploadedError when no object sits at the path', async () => {
    repo.seed(buildProduct());

    const error = await confirm().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ProductImageNotUploadedError);
    expect((error as ProductImageNotUploadedError).kind).toBe(ERROR_KINDS.NOT_FOUND);
    expect(repo.imageWrites).toHaveLength(0);
  });

  it('rejects a content type outside the allowlist, whatever the extension claimed', async () => {
    repo.seed(buildProduct());
    storage.putObject(path, { sizeBytes: 1000, contentType: 'image/svg+xml' });

    const error = await confirm().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(InvalidProductImageError);
    expect((error as InvalidProductImageError).kind).toBe(ERROR_KINDS.INVALID);
    expect(repo.imageWrites).toHaveLength(0);
  });

  it('rejects an empty object', async () => {
    repo.seed(buildProduct());
    storage.putObject(path, { sizeBytes: 0, contentType: 'image/png' });

    await expect(confirm()).rejects.toBeInstanceOf(InvalidProductImageError);
  });

  it('rejects an object over the size cap', async () => {
    repo.seed(buildProduct());
    storage.putObject(path, { sizeBytes: MAX_BYTES + 1, contentType: 'image/png' });

    await expect(confirm()).rejects.toBeInstanceOf(InvalidProductImageError);
  });

  // The bytes are in the bucket before we ever see them and there is no sweeper,
  // so a rejected upload that stays put lets a MANAGER park unbounded bytes.
  describe('rejected upload cleanup', () => {
    const rejections: [string, StoredObjectInfo][] = [
      ['a disallowed content type', { sizeBytes: 1000, contentType: 'image/svg+xml' }],
      ['an empty object', { sizeBytes: 0, contentType: 'image/png' }],
      ['an object over the cap', { sizeBytes: MAX_BYTES + 1, contentType: 'image/png' }],
    ];

    it.each(rejections)('removes the just-uploaded object after %s', async (_label, info) => {
      repo.seed(buildProduct());
      storage.putObject(path, info);

      const error = await confirm().catch((e: unknown) => e);

      expect(error).toBeInstanceOf(InvalidProductImageError);
      expect((error as InvalidProductImageError).kind).toBe(ERROR_KINDS.INVALID);
      expect(storage.removedPaths).toEqual([path]);
      expect(storage.has(path)).toBe(false);
      expect(storage.size).toBe(0);
      expect(repo.imageWrites).toHaveLength(0);
    });

    // Nothing was uploaded on this path, so there is nothing to delete either.
    it('removes nothing when no object was uploaded at all', async () => {
      repo.seed(buildProduct());

      await expect(confirm()).rejects.toBeInstanceOf(ProductImageNotUploadedError);
      expect(storage.removedPaths).toEqual([]);
    });

    // A cleanup that fails must not upgrade the 422 into a storage error.
    it('still surfaces the original 422 when the cleanup remove() rejects', async () => {
      repo.seed(buildProduct());
      storage.putObject(path, { sizeBytes: 0, contentType: 'image/png' });
      storage.removeFailure = new Error('delete refused');

      const error = await confirm().catch((e: unknown) => e);

      expect(error).toBeInstanceOf(InvalidProductImageError);
      expect((error as InvalidProductImageError).kind).toBe(ERROR_KINDS.INVALID);
      expect(error).not.toBeInstanceOf(ProductImageStorageError);
    });
  });

  it('accepts an object exactly at the cap', async () => {
    repo.seed(buildProduct());
    storage.putObject(path, { sizeBytes: MAX_BYTES, contentType: 'image/png' });

    await expect(confirm()).resolves.toBeInstanceOf(Product);
  });

  it('tolerates a charset parameter on the stored content type', async () => {
    repo.seed(buildProduct());
    storage.putObject(path, { sizeBytes: 10, contentType: 'image/png; charset=binary' });

    await expect(confirm()).resolves.toBeInstanceOf(Product);
  });

  it('writes the public URL and audits the change', async () => {
    repo.seed(buildProduct());
    storage.putObject(path, { sizeBytes: 1234, contentType: 'image/jpeg' });

    const result = await confirm();

    expect(result.imageUrl).toBe(storage.publicUrl(path));
    expect(repo.imageWrites).toEqual([{ id: PRODUCT_ID, imageUrl: storage.publicUrl(path) }]);
    expect(audit.entries[0]).toMatchObject({
      userId: 'admin-1',
      action: AUDIT_ACTIONS.PRODUCT_IMAGE_UPDATED,
      entity: 'Product',
      entityId: PRODUCT_ID,
      metadata: { imagePath: path, replacedPrevious: false },
    });
  });

  it('throws ProductNotFoundError when the row is deleted before the write (race)', async () => {
    repo.seed(buildProduct());
    storage.putObject(path, { sizeBytes: 1234, contentType: 'image/png' });
    repo.setImageUrlReturnsNull = true;

    await expect(confirm()).rejects.toBeInstanceOf(ProductNotFoundError);
  });

  it('removes the replaced object from the bucket', async () => {
    repo.seed(buildProduct(storage.publicUrl(oldPath)));
    storage.putObject(oldPath, { sizeBytes: 500, contentType: 'image/png' });
    storage.putObject(path, { sizeBytes: 1234, contentType: 'image/png' });

    const result = await confirm();

    expect(storage.removedPaths).toEqual([oldPath]);
    expect(storage.has(oldPath)).toBe(false);
    expect(storage.has(path)).toBe(true);
    expect(result.imageUrl).toBe(storage.publicUrl(path));
  });

  it('audits the replacement as such', async () => {
    repo.seed(buildProduct(storage.publicUrl(oldPath)));
    storage.putObject(path, { sizeBytes: 1234, contentType: 'image/png' });

    await confirm();

    expect(audit.entries[0].metadata).toEqual({ imagePath: path, replacedPrevious: true });
  });

  // A failed cleanup must never fail an image swap that already committed.
  it('still succeeds when remove() rejects', async () => {
    repo.seed(buildProduct(storage.publicUrl(oldPath)));
    storage.putObject(path, { sizeBytes: 1234, contentType: 'image/png' });
    storage.removeFailure = new Error('delete refused');

    const result = await confirm();

    expect(result.imageUrl).toBe(storage.publicUrl(path));
    expect(repo.store.get(PRODUCT_ID)?.imageUrl).toBe(storage.publicUrl(path));
  });

  // Legacy rows point at an external CDN (see the seed data). Those are not ours
  // to delete: fail safe, orphan at worst.
  it('never removes a previous image hosted outside our bucket', async () => {
    repo.seed(buildProduct('https://cdn.example.com/products/acaraje.jpg'));
    storage.putObject(path, { sizeBytes: 1234, contentType: 'image/png' });

    await confirm();

    expect(storage.removedPaths).toEqual([]);
    expect(audit.entries[0].metadata).toEqual({ imagePath: path, replacedPrevious: false });
  });

  // A tampered row could otherwise aim the delete at another product's folder.
  it('never removes a previous URL that resolves outside this product prefix', async () => {
    repo.seed(buildProduct(storage.publicUrl(foreignPath)));
    storage.putObject(foreignPath, { sizeBytes: 500, contentType: 'image/png' });
    storage.putObject(path, { sizeBytes: 1234, contentType: 'image/png' });

    await confirm();

    expect(storage.removedPaths).toEqual([]);
    expect(storage.has(foreignPath)).toBe(true);
  });

  it('does not remove the object it just confirmed when the URL is unchanged', async () => {
    repo.seed(buildProduct(storage.publicUrl(path)));
    storage.putObject(path, { sizeBytes: 1234, contentType: 'image/png' });

    await confirm();

    expect(storage.removedPaths).toEqual([]);
    expect(storage.has(path)).toBe(true);
  });

  it('wraps a head() failure in ProductImageStorageError (503), preserving the cause', async () => {
    repo.seed(buildProduct());
    const boom = new Error('bucket exploded');
    storage.failure = boom;

    const error = await confirm().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ProductImageStorageError);
    expect((error as ProductImageStorageError).kind).toBe(ERROR_KINDS.UNAVAILABLE);
    expect((error as ProductImageStorageError).cause).toBe(boom);
    expect((error as Error).message).not.toContain('bucket exploded');
  });

  it('accepts the exact path the value object mints', async () => {
    repo.seed(buildProduct());
    const minted = ProductImagePath.mint(PRODUCT_ID, 'image/webp', TOKEN);
    storage.putObject(minted.value, { sizeBytes: 10, contentType: 'image/webp' });

    const result = await confirm(minted.value);

    expect(result.imageUrl).toBe(storage.publicUrl(minted.value));
  });
});
