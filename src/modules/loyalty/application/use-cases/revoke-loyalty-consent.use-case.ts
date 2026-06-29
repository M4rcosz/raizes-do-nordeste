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
import { LoyaltyAccountNotFoundError } from '../errors/loyalty-account-not-found.error';

@Injectable()
export class RevokeLoyaltyConsentUseCase {
  private readonly logger = new Logger(RevokeLoyaltyConsentUseCase.name);

  constructor(
    @Inject(LOYALTY_REPOSITORY)
    private readonly accounts: LoyaltyRepository,
    @Inject(AUDIT_LOGGER)
    private readonly auditLogger: AuditLogger,
  ) {}

  // Withdraws consent: consentGiven flips to false and consentRevokedAt is stamped.
  // Points and transactions are left untouched (LGPD withdrawal stops future earning,
  // it does not erase history). No account means there is nothing to revoke -> 404.
  async execute(customerId: string): Promise<LoyaltyAccount> {
    const account = await this.accounts.revokeConsent(customerId);

    if (!account) {
      throw new LoyaltyAccountNotFoundError(
        'No loyalty account to withdraw consent from - it is created on your first order.',
      );
    }

    await this.tryAudit({
      userId: customerId,
      action: AUDIT_ACTIONS.LOYALTY_CONSENT_REVOKED,
      entity: 'LoyaltyAccount',
      entityId: account.id,
    });

    return account;
  }

  // Audit must never break the revocation outcome.
  private async tryAudit(input: AuditLogInput): Promise<void> {
    try {
      await this.auditLogger.log(input);
    } catch (err) {
      this.logger.warn({
        message: 'Audit logger threw during loyalty consent revocation; swallowed',
        action: input.action,
        cause: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
