import { beforeEach, describe, expect, it } from '@jest/globals';
import { Money } from '@shared/domain/value-objects/money';
import { AuditLogInput, AuditLogger } from '@modules/audit/application/ports/audit-logger.port';
import { AUDIT_ACTIONS } from '@modules/audit/domain/audit-actions';
import { SetProductActiveUseCase } from './set-product-active.use-case';
import { Product } from '../../domain/entities/product.entity';
import {
  CreateProductInput,
  FindProductsByBusinessUnitInput,
  FindProductsInput,
  ProductRepository,
} from '../../domain/repositories/product.repository';
import { ProductNotFoundError } from '../errors/product-not-found.error';

// In-memory fake. setActive flips the stored flag and returns the product, or null
// when no product matches the id, mirroring the conditional UPDATE contract.
class FakeProductRepository implements ProductRepository {
  readonly store = new Map<string, Product>();
  readonly setActiveCalls: { id: string; isActive: boolean }[] = [];

  seed(id: string, isActive: boolean): void {
    this.store.set(id, this.build(id, isActive));
  }

  findById(): Promise<Product | null> {
    return Promise.reject(new Error('not used'));
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

  setActive(id: string, isActive: boolean): Promise<Product | null> {
    this.setActiveCalls.push({ id, isActive });
    const current = this.store.get(id);
    if (!current) {
      return Promise.resolve(null);
    }
    const updated = this.build(id, isActive);
    this.store.set(id, updated);
    return Promise.resolve(updated);
  }

  private build(id: string, isActive: boolean): Product {
    return new Product(
      id,
      'Acarajé',
      null,
      Money.fromDecimalString('18.50'),
      isActive,
      'category-1',
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-01-02T00:00:00Z'),
      'https://example.com/acaraje.jpg',
    );
  }
}

// Records entries and, when armed, rejects to prove audit failures never break
// the toggle outcome.
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

describe('SetProductActiveUseCase', () => {
  let repo: FakeProductRepository;
  let audit: FakeAuditLogger;
  let useCase: SetProductActiveUseCase;

  beforeEach(() => {
    repo = new FakeProductRepository();
    audit = new FakeAuditLogger();
    useCase = new SetProductActiveUseCase(repo, audit);
  });

  it('activates a product and returns it with isActive true', async () => {
    repo.seed('product-1', false);

    const result = await useCase.execute('product-1', true, 'admin-1');

    expect(result.isActive).toBe(true);
    expect(repo.setActiveCalls).toEqual([{ id: 'product-1', isActive: true }]);
  });

  it('deactivates a product and returns it with isActive false', async () => {
    repo.seed('product-1', true);

    const result = await useCase.execute('product-1', false, 'admin-1');

    expect(result.isActive).toBe(false);
  });

  it('is idempotent: deactivating an already-inactive product returns the inactive state', async () => {
    repo.seed('product-1', false);

    const result = await useCase.execute('product-1', false, 'admin-1');

    expect(result.isActive).toBe(false);
  });

  it('throws ProductNotFoundError when the product does not exist', async () => {
    await expect(useCase.execute('ghost', true, 'admin-1')).rejects.toBeInstanceOf(
      ProductNotFoundError,
    );
  });

  it('audits the activation under the actor', async () => {
    repo.seed('product-1', false);

    await useCase.execute('product-1', true, 'admin-1');

    expect(audit.entries[0]).toMatchObject({
      userId: 'admin-1',
      action: AUDIT_ACTIONS.PRODUCT_ACTIVATED,
      entity: 'Product',
      entityId: 'product-1',
      metadata: { isActive: true },
    });
  });

  it('audits the deactivation under the actor', async () => {
    repo.seed('product-1', true);

    await useCase.execute('product-1', false, 'admin-1');

    expect(audit.entries[0]).toMatchObject({
      action: AUDIT_ACTIONS.PRODUCT_DEACTIVATED,
      metadata: { isActive: false },
    });
  });

  it('still resolves the toggle when the audit logger throws', async () => {
    repo.seed('product-1', false);
    audit.shouldThrow = true;

    const result = await useCase.execute('product-1', true, 'admin-1');

    expect(result.isActive).toBe(true);
  });
});
