import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ReinstateAiMembershipUseCase } from './reinstate-ai-membership.use-case';
import { FakeAiMembershipRepository } from './__fakes__/ai-membership-repository.fake';
import { AiMembershipNotFoundError } from '../errors/ai-membership-not-found.error';
import { AiMembership } from '../../domain/entities/ai-membership.entity';
import type { AuditLogger } from '@modules/audit/application/ports/audit-logger.port';

describe('ReinstateAiMembershipUseCase', () => {
  let repo: FakeAiMembershipRepository;
  let auditLog: jest.MockedFunction<AuditLogger['log']>;
  let useCase: ReinstateAiMembershipUseCase;

  beforeEach(() => {
    repo = new FakeAiMembershipRepository();
    // Seed a revoked membership.
    repo.seed(new AiMembership('ai-1', 'u-1', 100, new Date(), new Date(), new Date()));
    auditLog = jest.fn() as jest.MockedFunction<AuditLogger['log']>;
    auditLog.mockResolvedValue(undefined);
    useCase = new ReinstateAiMembershipUseCase(repo, { log: auditLog });
  });

  it('throws AiMembershipNotFoundError when the user has no membership', async () => {
    await expect(
      useCase.execute({ userId: 'u-unknown', actorId: 'admin-1' }),
    ).rejects.toBeInstanceOf(AiMembershipNotFoundError);
    expect(auditLog).not.toHaveBeenCalled();
  });

  it('reinstates a revoked membership, preserving the balance, and audits once', async () => {
    const reinstated = await useCase.execute({ userId: 'u-1', actorId: 'admin-1' });

    expect(reinstated.isRevoked).toBe(false);
    expect(reinstated.tokenBalance).toBe(100);
    expect(auditLog).toHaveBeenCalledTimes(1);
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'admin-1',
        action: 'AI_MEMBERSHIP_REINSTATED',
        entity: 'AiMembership',
        entityId: reinstated.id,
        metadata: { targetUserId: 'u-1' },
      }),
    );
  });

  it('is an idempotent no-op when already active: returns it, no audit', async () => {
    repo.seed(new AiMembership('ai-2', 'u-2', 50, new Date(), new Date()));

    const result = await useCase.execute({ userId: 'u-2', actorId: 'admin-1' });

    expect(result.isRevoked).toBe(false);
    expect(result.tokenBalance).toBe(50);
    expect(auditLog).not.toHaveBeenCalled();
  });
});
