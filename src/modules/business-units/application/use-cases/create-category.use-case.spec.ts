import { beforeEach, describe, expect, it } from '@jest/globals';
import { AuditLogInput, AuditLogger } from '@modules/audit/application/ports/audit-logger.port';
import { AUDIT_ACTIONS } from '@modules/audit/domain/audit-actions';
import { CreateCategoryUseCase } from './create-category.use-case';
import { Category } from '../../domain/entities/category.entity';
import {
  CreateCategoryInput,
  FindCategoriesInput,
  CategoryRepository,
} from '../../domain/repositories/category.repository';
import { CategoryAlreadyExistsError } from '../../domain/errors/category-already-exists.error';

// In-memory fake. create rejects on a duplicate name to mimic the unique
// constraint the Prisma repo translates into CategoryAlreadyExistsError.
class FakeCategoryRepository implements CategoryRepository {
  readonly store = new Map<string, Category>();
  private seq = 0;

  findById(id: string): Promise<Category | null> {
    return Promise.resolve(this.store.get(id) ?? null);
  }

  findAllActive(_input: FindCategoriesInput): Promise<Category[]> {
    return Promise.reject(new Error('not used'));
  }

  create(input: CreateCategoryInput): Promise<Category> {
    const nameTaken = [...this.store.values()].some((c) => c.name === input.name);
    if (nameTaken) {
      return Promise.reject(
        new CategoryAlreadyExistsError(`A category named "${input.name}" already exists.`),
      );
    }
    const category = new Category(
      `category-${++this.seq}`,
      input.name,
      input.description ?? null,
      true,
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-01-01T00:00:00Z'),
    );
    this.store.set(category.id, category);
    return Promise.resolve(category);
  }

  update(category: Category): Promise<Category | null> {
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

describe('CreateCategoryUseCase', () => {
  let repo: FakeCategoryRepository;
  let audit: FakeAuditLogger;
  let useCase: CreateCategoryUseCase;

  beforeEach(() => {
    repo = new FakeCategoryRepository();
    audit = new FakeAuditLogger();
    useCase = new CreateCategoryUseCase(repo, audit);
  });

  it('creates and returns the category', async () => {
    const result = await useCase.execute({ name: 'Bebidas', description: 'Sucos' }, 'admin-1');

    expect(result.name).toBe('Bebidas');
    expect(result.description).toBe('Sucos');
    expect(result.isActive).toBe(true);
  });

  it('audits the creation with the actor and new id', async () => {
    const result = await useCase.execute({ name: 'Bebidas' }, 'admin-1');

    expect(audit.entries[0]).toMatchObject({
      userId: 'admin-1',
      action: AUDIT_ACTIONS.CATEGORY_CREATED,
      entity: 'Category',
      entityId: result.id,
    });
  });

  it('propagates CategoryAlreadyExistsError on a duplicate name', async () => {
    await useCase.execute({ name: 'Bebidas' }, 'admin-1');

    await expect(useCase.execute({ name: 'Bebidas' }, 'admin-1')).rejects.toBeInstanceOf(
      CategoryAlreadyExistsError,
    );
  });

  it('does not audit when the create fails', async () => {
    await useCase.execute({ name: 'Bebidas' }, 'admin-1');
    audit.entries.length = 0;

    await useCase.execute({ name: 'Bebidas' }, 'admin-1').catch(() => undefined);

    expect(audit.entries).toHaveLength(0);
  });

  it('still resolves the create when the audit logger throws', async () => {
    audit.shouldThrow = true;

    const result = await useCase.execute({ name: 'Bebidas' }, 'admin-1');

    expect(result.name).toBe('Bebidas');
  });
});
