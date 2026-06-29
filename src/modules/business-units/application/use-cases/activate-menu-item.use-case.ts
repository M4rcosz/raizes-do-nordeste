import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AUDIT_LOGGER,
  type AuditLogInput,
  type AuditLogger,
} from '@modules/audit/application/ports/audit-logger.port';
import { AUDIT_ACTIONS } from '@modules/audit/domain/audit-actions';
import { MenuItem } from '../../domain/entities/menu-item.entity';
import {
  MENU_ITEM_REPOSITORY,
  type MenuItemRepository,
} from '../../domain/repositories/menu-item.repository';
import { MenuItemNotFoundError } from '../errors/menu-item-not-found.error';

@Injectable()
export class ActivateMenuItemUseCase {
  private readonly logger = new Logger(ActivateMenuItemUseCase.name);

  constructor(
    @Inject(MENU_ITEM_REPOSITORY)
    private readonly menuItems: MenuItemRepository,
    @Inject(AUDIT_LOGGER)
    private readonly auditLogger: AuditLogger,
  ) {}

  async execute(menuItemId: string, businessUnitId: string, actorId: string): Promise<MenuItem> {
    const updated = await this.menuItems.update({
      id: menuItemId,
      businessUnitId,
      isAvailable: true,
    });

    if (!updated) {
      throw new MenuItemNotFoundError(
        `Menu item with id "${menuItemId}" not found in business unit "${businessUnitId}".`,
      );
    }

    await this.tryAudit({
      userId: actorId,
      action: AUDIT_ACTIONS.MENU_ITEM_ACTIVATED,
      entity: 'MenuItem',
      entityId: updated.id,
      metadata: { businessUnitId, isAvailable: true },
    });

    return updated;
  }

  // Audit must never break the toggle outcome.
  private async tryAudit(input: AuditLogInput): Promise<void> {
    try {
      await this.auditLogger.log(input);
    } catch (err) {
      this.logger.warn({
        message: 'Audit logger threw during menu item activation; swallowed',
        action: input.action,
        cause: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
