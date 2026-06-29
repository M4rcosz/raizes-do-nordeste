import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AUDIT_LOGGER,
  type AuditLogInput,
  type AuditLogger,
} from '@modules/audit/application/ports/audit-logger.port';
import { AUDIT_ACTIONS } from '@modules/audit/domain/audit-actions';
import { LoyaltyAccount } from '../../domain/entities/loyalty-account.entity';
import {
  LOYALTY_REPOSITORY,
  type LoyaltyRepository,
} from '../../domain/repositories/loyalty.repository';

@Injectable()
export class GiveLoyaltyConsentUseCase {
  private readonly logger = new Logger(GiveLoyaltyConsentUseCase.name);

  constructor(
    @Inject(LOYALTY_REPOSITORY)
    private readonly accounts: LoyaltyRepository,
    @Inject(AUDIT_LOGGER)
    private readonly auditLogger: AuditLogger,
  ) {}

  // Upsert: a customer with no account yet gets one created already consented;
  // an existing account is marked consented (consentDate refreshed, any prior
  // revocation cleared). Idempotent - granting again just refreshes the state.
  async execute(customerId: string): Promise<LoyaltyAccount> {
    const account = await this.accounts.grantConsent(customerId);

    await this.tryAudit({
      userId: customerId,
      action: AUDIT_ACTIONS.LOYALTY_CONSENT_GIVEN,
      entity: 'LoyaltyAccount',
      entityId: account.id,
    });

    return account;
  }

  // Audit must never break the consent outcome.
  private async tryAudit(input: AuditLogInput): Promise<void> {
    try {
      await this.auditLogger.log(input);
    } catch (err) {
      this.logger.warn({
        message: 'Audit logger threw during loyalty consent grant; swallowed',
        action: input.action,
        cause: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
