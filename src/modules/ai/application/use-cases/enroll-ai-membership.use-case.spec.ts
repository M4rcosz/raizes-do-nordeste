import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { EnrollAiMembershipUseCase } from './enroll-ai-membership.use-case';
import { FakeAiMembershipRepository } from './__fakes__/ai-membership-repository.fake';
import { AiMembershipAlreadyExistsError } from '../errors/ai-membership-already-exists.error';
import type { AuditLogger } from '@modules/audit/application/ports/audit-logger.port';

describe('EnrollAiMembershipUseCase', () => {
  let repo: FakeAiMembershipRepository;
  let auditLog: jest.MockedFunction<AuditLogger['log']>;
  let useCase: EnrollAiMembershipUseCase;

  beforeEach(() => {
    repo = new FakeAiMembershipRepository();
    auditLog = jest.fn() as jest.MockedFunction<AuditLogger['log']>;
    auditLog.mockResolvedValue(undefined);
    useCase = new EnrollAiMembershipUseCase(repo, { log: auditLog });
  });

  it('creates the membership when the user has none', async () => {
    const membership = await useCase.execute({
      userId: 'u-1',
      initialBalance: 5000,
      actorId: 'admin-1',
    });

    expect(membership.userId).toBe('u-1');
    expect(membership.tokenBalance).toBe(5000);
    await expect(repo.findByUserId('u-1')).resolves.not.toBeNull();
  });

  it('audits the enrollment with the actor and target', async () => {
    const membership = await useCase.execute({
      userId: 'u-1',
      initialBalance: 5000,
      actorId: 'admin-1',
    });

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'admin-1',
        action: 'AI_MEMBERSHIP_ENROLLED',
        entity: 'AiMembership',
        entityId: membership.id,
        metadata: { targetUserId: 'u-1', initialBalance: 5000 },
      }),
    );
  });

  it('throws AiMembershipAlreadyExistsError when the user already has one', async () => {
    await useCase.execute({ userId: 'u-1', initialBalance: 100, actorId: 'admin-1' });

    await expect(
      useCase.execute({ userId: 'u-1', initialBalance: 200, actorId: 'admin-1' }),
    ).rejects.toBeInstanceOf(AiMembershipAlreadyExistsError);
    expect(auditLog).toHaveBeenCalledTimes(1);
  });
});
