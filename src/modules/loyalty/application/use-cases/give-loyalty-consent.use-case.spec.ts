import { beforeEach, describe, expect, it } from '@jest/globals';
import { AuditLogInput, AuditLogger } from '@modules/audit/application/ports/audit-logger.port';
import { AUDIT_ACTIONS } from '@modules/audit/domain/audit-actions';
import { TransactionContext } from '@shared/transaction/transaction-runner.port';
import { GiveLoyaltyConsentUseCase } from './give-loyalty-consent.use-case';
import { LoyaltyAccount } from '../../domain/entities/loyalty-account.entity';
import {
  EarnPointsInput,
  LoyaltyRepository,
  RedeemPointsInput,
} from '../../domain/repositories/loyalty.repository';

// In-memory fake. grantConsent upserts a consented account: created when absent,
// otherwise marked consentGiven=true with consentDate refreshed and any prior
// revocation cleared - mirroring the prisma upsert.
class FakeLoyaltyRepository implements LoyaltyRepository {
  readonly store = new Map<string, LoyaltyAccount>();
  readonly grantCalls: string[] = [];

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

  grantConsent(customerId: string): Promise<LoyaltyAccount> {
    this.grantCalls.push(customerId);
    const now = new Date();
    const current = this.store.get(customerId);
    const updated = new LoyaltyAccount(
      current?.id ?? `la-${customerId}`,
      customerId,
      current?.totalPoints ?? 0,
      true,
      now,
      null,
      current?.createdAt ?? now,
      now,
    );
    this.store.set(customerId, updated);
    return Promise.resolve(updated);
  }

  revokeConsent(_customerId: string): Promise<LoyaltyAccount | null> {
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

describe('GiveLoyaltyConsentUseCase', () => {
  let repo: FakeLoyaltyRepository;
  let audit: FakeAuditLogger;
  let useCase: GiveLoyaltyConsentUseCase;

  beforeEach(() => {
    repo = new FakeLoyaltyRepository();
    audit = new FakeAuditLogger();
    useCase = new GiveLoyaltyConsentUseCase(repo, audit);
  });

  it('creates a consented account when the customer has none', async () => {
    const account = await useCase.execute('c-1');

    expect(account.consentGiven).toBe(true);
    expect(account.consentDate).not.toBeNull();
    expect(account.consentRevokedAt).toBeNull();
    expect(repo.grantCalls).toEqual(['c-1']);
  });

  it('marks an existing account consented and clears a prior revocation', async () => {
    repo.seed(
      new LoyaltyAccount('la-1', 'c-1', 30, false, new Date(), new Date(), new Date(), new Date()),
    );

    const account = await useCase.execute('c-1');

    expect(account.id).toBe('la-1');
    expect(account.totalPoints).toBe(30);
    expect(account.consentGiven).toBe(true);
    expect(account.consentRevokedAt).toBeNull();
  });

  it('audits LOYALTY_CONSENT_GIVEN under the customer', async () => {
    const account = await useCase.execute('c-1');

    expect(audit.entries[0]).toMatchObject({
      userId: 'c-1',
      action: AUDIT_ACTIONS.LOYALTY_CONSENT_GIVEN,
      entity: 'LoyaltyAccount',
      entityId: account.id,
    });
  });

  it('still resolves the consented account when the audit logger throws', async () => {
    audit.shouldThrow = true;

    const account = await useCase.execute('c-1');

    expect(account.consentGiven).toBe(true);
    expect(repo.grantCalls).toEqual(['c-1']);
  });
});
