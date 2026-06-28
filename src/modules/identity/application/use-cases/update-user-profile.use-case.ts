import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AUDIT_LOGGER,
  type AuditLogInput,
  type AuditLogger,
} from '@modules/audit/application/ports/audit-logger.port';
import { AUDIT_ACTIONS } from '@modules/audit/domain/audit-actions';
import { User } from '@modules/identity/domain/entities/user.entity';
import {
  USER_REPOSITORY,
  type UpdateProfileInput,
  type UserRepository,
} from '@modules/identity/domain/repositories/user.repository';
import { UserNotFoundError } from '../errors/user-not-found.error';

export interface UpdateUserProfileCommand {
  name?: string;
  phone?: string;
}

@Injectable()
export class UpdateUserProfileUseCase {
  private readonly logger = new Logger(UpdateUserProfileUseCase.name);

  constructor(
    @Inject(USER_REPOSITORY)
    private readonly users: UserRepository,
    @Inject(AUDIT_LOGGER)
    private readonly auditLogger: AuditLogger,
  ) {}

  // actorId is always the authenticated user: self-update only.
  // UserAlreadyExistsError (phone collision) is not caught here; it bubbles to
  // the filter which maps CONFLICT -> 409.
  async execute(actorId: string, command: UpdateUserProfileCommand): Promise<User> {
    const user = await this.users.findById(actorId);
    if (!user) {
      throw new UserNotFoundError(`User ${actorId} not found.`);
    }

    // Build the new instance; domain is the source of truth for what fields become.
    const projected = user.withProfile(command);

    const updatedFields = Object.keys(command).filter(
      (k) => command[k as keyof UpdateUserProfileCommand] !== undefined,
    );

    // Feed the repo from the projected entity, not the raw command, so any domain
    // rule applied by withProfile is reflected in what gets persisted.
    const persistData: UpdateProfileInput = {};
    if (command.name !== undefined) {
      persistData.name = projected.name;
    }
    if (command.phone !== undefined) {
      persistData.phone = projected.phone ?? undefined;
    }

    // updateProfile throws UserAlreadyExistsError on phone collision; let it bubble.
    const updated = await this.users.updateProfile(actorId, persistData, actorId);
    if (!updated) {
      throw new UserNotFoundError(`User ${actorId} not found.`);
    }

    await this.tryAudit({
      userId: actorId,
      action: AUDIT_ACTIONS.USER_UPDATED,
      entity: 'User',
      entityId: actorId,
      // Only field names, never values (phone is PII).
      metadata: { updatedFields },
    });

    return updated;
  }

  // Audit must never break the update outcome.
  private async tryAudit(input: AuditLogInput): Promise<void> {
    try {
      await this.auditLogger.log(input);
    } catch (err) {
      this.logger.warn({
        message: 'Audit logger threw during profile update; swallowed',
        action: input.action,
        cause: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
