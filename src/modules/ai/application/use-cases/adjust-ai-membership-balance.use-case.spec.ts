import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AdjustAiMembershipBalanceUseCase } from './adjust-ai-membership-balance.use-case';
import { FakeAiMembershipRepository } from './__fakes__/ai-membership-repository.fake';
import { TokenBudgetExceededError } from '../../domain/errors/token-budget-exceeded.error';
import { AiMembershipNotFoundError } from '../errors/ai-membership-not-found.error';
import { AiMembership, MAX_TOKEN_BALANCE } from '../../domain/entities/ai-membership.entity';
import type { AuditLogger } from '@modules/audit/application/ports/audit-logger.port';

describe('AdjustAiMembershipBalanceUseCase', () => {
  let repo: FakeAiMembershipRepository;
  let auditLog: jest.MockedFunction<AuditLogger['log']>;
  let useCase: AdjustAiMembershipBalanceUseCase;

  beforeEach(() => {
    repo = new FakeAiMembershipRepository();
    repo.seed(new AiMembership('ai-1', 'u-1', 100, new Date(), new Date()));
    auditLog = jest.fn() as jest.MockedFunction<AuditLogger['log']>;
    auditLog.mockResolvedValue(undefined);
    useCase = new AdjustAiMembershipBalanceUseCase(repo, { log: auditLog });
  });

  it('credits the balance on a positive delta', async () => {
    const updated = await useCase.execute({ userId: 'u-1', delta: 50, actorId: 'admin-1' });

    expect(updated.tokenBalance).toBe(150);
  });

  it('debits the balance on a negative delta within balance', async () => {
    const updated = await useCase.execute({ userId: 'u-1', delta: -40, actorId: 'admin-1' });

    expect(updated.tokenBalance).toBe(60);
  });

  it('audits the adjustment with the actor and delta', async () => {
    await useCase.execute({ userId: 'u-1', delta: 50, actorId: 'admin-1' });

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'admin-1',
        action: 'AI_MEMBERSHIP_ADJUSTED',
        entity: 'AiMembership',
        metadata: expect.objectContaining({ targetUserId: 'u-1', delta: 50 }),
      }),
    );
  });

  it('throws TokenBudgetExceededError when a debit would go below zero', async () => {
    await expect(
      useCase.execute({ userId: 'u-1', delta: -101, actorId: 'admin-1' }),
    ).rejects.toBeInstanceOf(TokenBudgetExceededError);
    expect(auditLog).not.toHaveBeenCalled();
  });

  it('throws TokenBudgetExceededError when a credit would overflow the int4 ceiling', async () => {
    repo.seed(new AiMembership('ai-2', 'u-2', MAX_TOKEN_BALANCE - 10, new Date(), new Date()));

    await expect(
      useCase.execute({ userId: 'u-2', delta: 11, actorId: 'admin-1' }),
    ).rejects.toBeInstanceOf(TokenBudgetExceededError);
    expect(auditLog).not.toHaveBeenCalled();
  });

  it('throws AiMembershipNotFoundError when the user has no membership', async () => {
    await expect(
      useCase.execute({ userId: 'u-unknown', delta: 10, actorId: 'admin-1' }),
    ).rejects.toBeInstanceOf(AiMembershipNotFoundError);
  });

  it('rejects a zero delta as invalid', async () => {
    await expect(
      useCase.execute({ userId: 'u-1', delta: 0, actorId: 'admin-1' }),
    ).rejects.toBeInstanceOf(TokenBudgetExceededError);
  });
});
