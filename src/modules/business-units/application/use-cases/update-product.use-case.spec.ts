import { beforeEach, describe, expect, it } from '@jest/globals';
import { Money } from '@shared/domain/value-objects/money';
import { AuditLogInput, AuditLogger } from '@modules/audit/application/ports/audit-logger.port';
import { AUDIT_ACTIONS } from '@modules/audit/domain/audit-actions';
import { UpdateProductInput, UpdateProductUseCase } from './update-product.use-case';
import { Product } from '../../domain/entities/product.entity';
import {
  CreateProductInput,
  FindProductsByBusinessUnitInput,
  FindProductsInput,
  ProductRepository,
} from '../../domain/repositories/product.repository';
import { ProductNotFoundError } from '../errors/product-not-found.error';

// In-memory fake. findById returns the seeded product; update writes back the
// passed entity and returns it, or null when nothing was seeded (delete race).
class FakeProductRepository implements ProductRepository {
  readonly store = new Map<string, Product>();
  readonly updated: Product[] = [];
  updateReturnsNull = false;

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

  update(product: Product): Promise<Product | null> {
    this.updated.push(product);
    if (this.updateReturnsNull) {
      return Promise.resolve(null);
    }
    this.store.set(product.id, product);
    return Promise.resolve(product);
  }

  setActive(): Promise<Product | null> {
    return Promise.reject(new Error('not used'));
  }
}

class FakeAuditLogger implements AuditLogger {
  readonly entries: AuditLogInput[] = [];
  shouldThrow = false;

  log(input: AuditLogInput): Promise<void> {
    if (this.shouldThrow) {
      return Promise.reject(new Error('audit sink down'));
    }
    this.entries.push(input);
    return Promise.resolve();
  }
}

const buildProduct = (): Product =>
  new Product(
    'product-1',
    'Acarajé',
    'Original',
    Money.fromDecimalString('18.50'),
    true,
    'category-1',
    new Date('2026-01-01T00:00:00Z'),
    new Date('2026-01-02T00:00:00Z'),
    'https://example.com/acaraje.jpg',
  );

describe('UpdateProductUseCase', () => {
  let repo: FakeProductRepository;
  let audit: FakeAuditLogger;
  let useCase: UpdateProductUseCase;

  beforeEach(() => {
    repo = new FakeProductRepository();
    audit = new FakeAuditLogger();
    useCase = new UpdateProductUseCase(repo, audit);
  });

  it('applies the patch and persists the updated product', async () => {
    repo.seed(buildProduct());

    const result = await useCase.execute(
      'product-1',
      { name: 'Vatapá', price: '20.00' },
      'admin-1',
    );

    expect(result.name).toBe('Vatapá');
    expect(result.price.equals(Money.fromDecimalString('20.00'))).toBe(true);
    // Untouched fields carry over from the loaded product.
    expect(result.description).toBe('Original');
    expect(repo.updated).toHaveLength(1);
  });

  it('converts the price string into Money at the domain border', async () => {
    repo.seed(buildProduct());

    await useCase.execute('product-1', { price: '7.99' }, 'admin-1');

    expect(repo.updated[0].price.equals(Money.fromDecimalString('7.99'))).toBe(true);
  });

  it('throws ProductNotFoundError when the product does not exist', async () => {
    await expect(useCase.execute('ghost', { name: 'Vatapá' }, 'admin-1')).rejects.toBeInstanceOf(
      ProductNotFoundError,
    );
  });

  it('throws ProductNotFoundError when the row is deleted before the write (race)', async () => {
    repo.seed(buildProduct());
    repo.updateReturnsNull = true;

    await expect(
      useCase.execute('product-1', { name: 'Vatapá' }, 'admin-1'),
    ).rejects.toBeInstanceOf(ProductNotFoundError);
  });

  it('audits the update with only the changed field names', async () => {
    repo.seed(buildProduct());

    await useCase.execute('product-1', { name: 'Vatapá', price: '20.00' }, 'admin-1');

    expect(audit.entries[0]).toMatchObject({
      userId: 'admin-1',
      action: AUDIT_ACTIONS.PRODUCT_UPDATED,
      entity: 'Product',
      entityId: 'product-1',
      metadata: { updatedFields: ['name', 'price'] },
    });
  });

  it('audits only real patchable fields, ignoring non-domain carrier keys', async () => {
    repo.seed(buildProduct());

    // Simulates the DTO's validation-only carrier (_atLeastOneField) surviving
    // into the input object; it must never leak into the audit trail.
    const inputWithCarrier: UpdateProductInput & Record<string, unknown> = { name: 'Vatapá' };
    inputWithCarrier._atLeastOneField = 'boom';

    await useCase.execute('product-1', inputWithCarrier, 'admin-1');

    expect(audit.entries[0].metadata).toEqual({ updatedFields: ['name'] });
  });

  it('still resolves the update when the audit logger throws', async () => {
    repo.seed(buildProduct());
    audit.shouldThrow = true;

    const result = await useCase.execute('product-1', { name: 'Vatapá' }, 'admin-1');

    expect(result.name).toBe('Vatapá');
  });
});
