import { beforeEach, describe, expect, it } from '@jest/globals';
import { GetMyAiMembershipUseCase } from './get-my-ai-membership.use-case';
import { FakeAiMembershipRepository } from './__fakes__/ai-membership-repository.fake';
import { AiMembershipNotFoundError } from '../errors/ai-membership-not-found.error';
import { AiMembershipFetchError } from '../errors/ai-membership-fetch.error';
import { AiMembership } from '../../domain/entities/ai-membership.entity';
import type { AiMembershipRepository } from '../../domain/repositories/ai-membership.repository';

describe('GetMyAiMembershipUseCase', () => {
  let repo: FakeAiMembershipRepository;
  let useCase: GetMyAiMembershipUseCase;

  beforeEach(() => {
    repo = new FakeAiMembershipRepository();
    useCase = new GetMyAiMembershipUseCase(repo);
  });

  it('returns the authenticated user membership', async () => {
    const membership = new AiMembership('ai-1', 'u-1', 42, new Date(), new Date());
    repo.seed(membership);

    await expect(useCase.execute('u-1')).resolves.toBe(membership);
  });

  it('throws AiMembershipNotFoundError when the user has no membership yet', async () => {
    await expect(useCase.execute('u-1')).rejects.toBeInstanceOf(AiMembershipNotFoundError);
  });

  it('wraps a persistence failure as AiMembershipFetchError', async () => {
    const failing: AiMembershipRepository = {
      findByUserId: () => Promise.reject(new Error('db down')),
      create: () => Promise.reject(new Error('not stubbed')),
      adjustBalance: () => Promise.reject(new Error('not stubbed')),
      debit: () => Promise.reject(new Error('not stubbed')),
    };
    const failingUseCase = new GetMyAiMembershipUseCase(failing);

    await expect(failingUseCase.execute('u-1')).rejects.toBeInstanceOf(AiMembershipFetchError);
  });
});
