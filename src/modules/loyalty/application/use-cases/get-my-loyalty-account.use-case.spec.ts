import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { GetMyLoyaltyAccountUseCase } from './get-my-loyalty-account.use-case';
import type { LoyaltyRepository } from '../../domain/repositories/loyalty.repository';
import { LoyaltyAccount } from '../../domain/entities/loyalty-account.entity';
import { LoyaltyAccountNotFoundError } from '../errors/loyalty-account-not-found.error';

describe('GetMyLoyaltyAccountUseCase', () => {
  let findByCustomerId: jest.MockedFunction<LoyaltyRepository['findByCustomerId']>;
  let useCase: GetMyLoyaltyAccountUseCase;

  beforeEach(() => {
    findByCustomerId = jest.fn() as jest.MockedFunction<LoyaltyRepository['findByCustomerId']>;
    const repo: LoyaltyRepository = {
      findByCustomerId,
      createIfAbsent: jest.fn() as jest.MockedFunction<LoyaltyRepository['createIfAbsent']>,
      earn: jest.fn() as jest.MockedFunction<LoyaltyRepository['earn']>,
    };
    useCase = new GetMyLoyaltyAccountUseCase(repo);
  });

  it('returns the authenticated customer account', async () => {
    const account = new LoyaltyAccount('la-1', 'c-1', 42, true, new Date(), new Date(), new Date());
    findByCustomerId.mockResolvedValue(account);

    await expect(useCase.execute('c-1')).resolves.toBe(account);
    expect(findByCustomerId).toHaveBeenCalledWith('c-1');
  });

  it('throws LoyaltyAccountNotFoundError when the customer has no account yet', async () => {
    findByCustomerId.mockResolvedValue(null);

    await expect(useCase.execute('c-1')).rejects.toBeInstanceOf(LoyaltyAccountNotFoundError);
  });
});
