import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { Money } from '@shared/domain/value-objects/money';
import {
  AUDIT_LOGGER,
  AuditLogInput,
  AuditLogger,
} from '@modules/audit/application/ports/audit-logger.port';
import { AUDIT_ACTIONS } from '@modules/audit/domain/audit-actions';
import {
  MenuItemRepository,
  MENU_ITEM_REPOSITORY,
} from '../../domain/repositories/menu-item.repository';
import { ActivateMenuItemUseCase } from './activate-menu-item.use-case';
import { MenuItem } from '../../domain/entities/menu-item.entity';
import { MenuItemNotFoundError } from '../errors/menu-item-not-found.error';

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

describe('ActivateMenuItemUseCase', () => {
  let useCase: ActivateMenuItemUseCase;
  let audit: FakeAuditLogger;
  let update: jest.MockedFunction<MenuItemRepository['update']>;

  beforeAll(async () => {
    update = jest.fn() as jest.MockedFunction<MenuItemRepository['update']>;
    audit = new FakeAuditLogger();

    const mockRepo: jest.Mocked<MenuItemRepository> = {
      findAvailableById: jest.fn(),
      findAllByBusinessUnit: jest.fn(),
      create: jest.fn(),
      update,
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ActivateMenuItemUseCase,
        { provide: MENU_ITEM_REPOSITORY, useValue: mockRepo },
        { provide: AUDIT_LOGGER, useValue: audit },
      ],
    }).compile();

    useCase = moduleRef.get(ActivateMenuItemUseCase);
  });

  afterEach(() => {
    jest.clearAllMocks();
    audit.entries.length = 0;
    audit.shouldThrow = false;
  });

  describe('execute', () => {
    const buildItem = (): MenuItem =>
      new MenuItem(
        'menu-item-1',
        'bu-1',
        'product-1',
        Money.fromDecimalString('15.90'),
        true,
        new Date(),
        new Date(),
      );

    it('should flip isAvailable to true via a unit-scoped update', async () => {
      const updated = buildItem();
      update.mockResolvedValue(updated);

      const result = await useCase.execute('menu-item-1', 'bu-1', 'admin-1');

      expect(update).toHaveBeenCalledWith({
        id: 'menu-item-1',
        businessUnitId: 'bu-1',
        isAvailable: true,
      });
      expect(result).toBe(updated);
    });

    it('should throw MenuItemNotFoundError when no matching item exists', async () => {
      update.mockResolvedValue(null);

      await expect(useCase.execute('missing', 'bu-1', 'admin-1')).rejects.toBeInstanceOf(
        MenuItemNotFoundError,
      );
    });

    it('should audit the activation under the actor', async () => {
      update.mockResolvedValue(buildItem());

      await useCase.execute('menu-item-1', 'bu-1', 'admin-1');

      expect(audit.entries[0]).toMatchObject({
        userId: 'admin-1',
        action: AUDIT_ACTIONS.MENU_ITEM_ACTIVATED,
        entity: 'MenuItem',
        entityId: 'menu-item-1',
        metadata: { businessUnitId: 'bu-1', isAvailable: true },
      });
    });

    it('should still resolve the toggle when the audit logger throws', async () => {
      const updated = buildItem();
      update.mockResolvedValue(updated);
      audit.shouldThrow = true;

      const result = await useCase.execute('menu-item-1', 'bu-1', 'admin-1');

      expect(result).toBe(updated);
    });
  });
});
