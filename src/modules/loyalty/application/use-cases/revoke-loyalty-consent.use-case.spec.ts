import { beforeEach, describe, expect, it } from '@jest/globals';
import { AuditLogInput, AuditLogger } from '@modules/audit/application/ports/audit-logger.port';
import { AUDIT_ACTIONS } from '@modules/audit/domain/audit-actions';
import { TransactionContext } from '@shared/transaction/transaction-runner.port';
import { RevokeLoyaltyConsentUseCase } from './revoke-loyalty-consent.use-case';
import { LoyaltyAccount } from '../../domain/entities/loyalty-account.entity';
import {
  EarnPointsInput,
  LoyaltyRepository,
  RedeemPointsInput,
} from '../../domain/repositories/loyalty.repository';
import { LoyaltyAccountNotFoundError } from '../errors/loyalty-account-not-found.error';

// In-memory fake. revokeConsent flips an existing account to consentGiven=false and
// stamps consentRevokedAt, leaving points untouched; returns null when absent.
class FakeLoyaltyRepository implements LoyaltyRepository {
  readonly store = new Map<string, LoyaltyAccount>();
  readonly revokeCalls: string[] = [];

  seed(account: LoyaltyAccount): void {
    this.store.set(account.customerId, account);
  }

  findByCustomerId(customerId: string): Promise<LoyaltyAccount | null> {
    return Promise.resolve(this.store.get(customerId) ?? null);
  }

  createIfAbsent(_customerId: string): Promise<void> {
    return Promise.reject(new Error('not used'));
  }

  earn(_input: EarnPointsInput, _tx: TransactionContext): Promise<void> {
    return Promise.reject(new Error('not used'));
  }

  redeem(_input: RedeemPointsInput, _tx: TransactionContext): Promise<void> {
    return Promise.reject(new Error('not used'));
  }

  grantConsent(_customerId: string): Promise<LoyaltyAccount> {
    return Promise.reject(new Error('not used'));
  }

  revokeConsent(customerId: string): Promise<LoyaltyAccount | null> {
    this.revokeCalls.push(customerId);
    const current = this.store.get(customerId);
    if (!current) {
      return Promise.resolve(null);
    }
    const updated = new LoyaltyAccount(
      current.id,
      current.customerId,
      current.totalPoints,
      false,
      current.consentDate,
      new Date(),
      current.createdAt,
      new Date(),
    );
    this.store.set(customerId, updated);
    return Promise.resolve(updated);
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

describe('RevokeLoyaltyConsentUseCase', () => {
  let repo: FakeLoyaltyRepository;
  let audit: FakeAuditLogger;
  let useCase: RevokeLoyaltyConsentUseCase;

  beforeEach(() => {
    repo = new FakeLoyaltyRepository();
    audit = new FakeAuditLogger();
    useCase = new RevokeLoyaltyConsentUseCase(repo, audit);
  });

  it('withdraws consent and stamps consentRevokedAt without touching points', async () => {
    repo.seed(
      new LoyaltyAccount('la-1', 'c-1', 30, true, new Date(), null, new Date(), new Date()),
    );

    const account = await useCase.execute('c-1');

    expect(account.consentGiven).toBe(false);
    expect(account.consentRevokedAt).not.toBeNull();
    expect(account.totalPoints).toBe(30);
    expect(repo.revokeCalls).toEqual(['c-1']);
  });

  it('throws LoyaltyAccountNotFoundError when the customer has no account', async () => {
    await expect(useCase.execute('ghost')).rejects.toBeInstanceOf(LoyaltyAccountNotFoundError);
  });

  it('audits LOYALTY_CONSENT_REVOKED under the customer', async () => {
    repo.seed(new LoyaltyAccount('la-1', 'c-1', 0, true, new Date(), null, new Date(), new Date()));

    await useCase.execute('c-1');

    expect(audit.entries[0]).toMatchObject({
      userId: 'c-1',
      action: AUDIT_ACTIONS.LOYALTY_CONSENT_REVOKED,
      entity: 'LoyaltyAccount',
      entityId: 'la-1',
    });
  });

  it('still resolves the revoked account when the audit logger throws', async () => {
    repo.seed(new LoyaltyAccount('la-1', 'c-1', 0, true, new Date(), null, new Date(), new Date()));
    audit.shouldThrow = true;

    const account = await useCase.execute('c-1');

    expect(account.consentGiven).toBe(false);
    expect(account.consentRevokedAt).not.toBeNull();
    expect(repo.revokeCalls).toEqual(['c-1']);
  });
});
