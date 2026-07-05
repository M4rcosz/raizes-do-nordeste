import { beforeEach, describe, expect, it } from '@jest/globals';
import { AuditLogInput, AuditLogger } from '@modules/audit/application/ports/audit-logger.port';
import { AUDIT_ACTIONS } from '@modules/audit/domain/audit-actions';
import { UpdateCategoryInput, UpdateCategoryUseCase } from './update-category.use-case';
import { Category } from '../../domain/entities/category.entity';
import {
  CreateCategoryInput,
  FindCategoriesInput,
  CategoryRepository,
} from '../../domain/repositories/category.repository';
import { CategoryNotFoundError } from '../../domain/errors/category-not-found.error';

// In-memory fake. findById returns the seeded category; update writes back the
// passed entity and returns it, or null when nothing was seeded (delete race).
class FakeCategoryRepository implements CategoryRepository {
  readonly store = new Map<string, Category>();
  readonly updated: Category[] = [];
  updateReturnsNull = false;

  seed(category: Category): void {
    this.store.set(category.id, category);
  }

  findById(id: string): Promise<Category | null> {
    return Promise.resolve(this.store.get(id) ?? null);
  }

  findAllActive(_input: FindCategoriesInput): Promise<Category[]> {
    return Promise.reject(new Error('not used'));
  }

  create(_input: CreateCategoryInput): Promise<Category> {
    return Promise.reject(new Error('not used'));
  }

  update(category: Category): Promise<Category | null> {
    this.updated.push(category);
    if (this.updateReturnsNull) {
      return Promise.resolve(null);
    }
    this.store.set(category.id, category);
    return Promise.resolve(category);
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

const buildCategory = (): Category =>
  new Category(
    'category-1',
    'Bebidas',
    'Sucos',
    true,
    new Date('2026-01-01T00:00:00Z'),
    new Date('2026-01-02T00:00:00Z'),
  );

describe('UpdateCategoryUseCase', () => {
  let repo: FakeCategoryRepository;
  let audit: FakeAuditLogger;
  let useCase: UpdateCategoryUseCase;

  beforeEach(() => {
    repo = new FakeCategoryRepository();
    audit = new FakeAuditLogger();
    useCase = new UpdateCategoryUseCase(repo, audit);
  });

  it('applies the patch and persists the updated category', async () => {
    repo.seed(buildCategory());

    const result = await useCase.execute('category-1', { name: 'Sobremesas' }, 'admin-1');

    expect(result.name).toBe('Sobremesas');
    // Untouched fields carry over from the loaded category.
    expect(result.description).toBe('Sucos');
    expect(repo.updated).toHaveLength(1);
  });

  it('toggles isActive when provided', async () => {
    repo.seed(buildCategory());

    const result = await useCase.execute('category-1', { isActive: false }, 'admin-1');

    expect(result.isActive).toBe(false);
  });

  it('throws CategoryNotFoundError when the category does not exist', async () => {
    await expect(
      useCase.execute('ghost', { name: 'Sobremesas' }, 'admin-1'),
    ).rejects.toBeInstanceOf(CategoryNotFoundError);
  });

  it('throws CategoryNotFoundError when the row is deleted before the write (race)', async () => {
    repo.seed(buildCategory());
    repo.updateReturnsNull = true;

    await expect(
      useCase.execute('category-1', { name: 'Sobremesas' }, 'admin-1'),
    ).rejects.toBeInstanceOf(CategoryNotFoundError);
  });

  it('audits the update with only the changed field names', async () => {
    repo.seed(buildCategory());

    await useCase.execute('category-1', { name: 'Sobremesas', isActive: false }, 'admin-1');

    expect(audit.entries[0]).toMatchObject({
      userId: 'admin-1',
      action: AUDIT_ACTIONS.CATEGORY_UPDATED,
      entity: 'Category',
      entityId: 'category-1',
      metadata: { updatedFields: ['name', 'isActive'] },
    });
  });

  it('audits only real patchable fields, ignoring non-domain carrier keys', async () => {
    repo.seed(buildCategory());

    // Simulates the DTO's validation-only carrier (_atLeastOneField) surviving
    // into the input object; it must never leak into the audit trail.
    const inputWithCarrier: UpdateCategoryInput & Record<string, unknown> = { name: 'Sobremesas' };
    inputWithCarrier._atLeastOneField = 'boom';

    await useCase.execute('category-1', inputWithCarrier, 'admin-1');

    expect(audit.entries[0].metadata).toEqual({ updatedFields: ['name'] });
  });

  it('still resolves the update when the audit logger throws', async () => {
    repo.seed(buildCategory());
    audit.shouldThrow = true;

    const result = await useCase.execute('category-1', { name: 'Sobremesas' }, 'admin-1');

    expect(result.name).toBe('Sobremesas');
  });
});
