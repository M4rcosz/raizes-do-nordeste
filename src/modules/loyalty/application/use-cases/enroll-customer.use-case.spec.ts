import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { EnrollCustomerUseCase } from './enroll-customer.use-case';
import type { LoyaltyRepository } from '../../domain/repositories/loyalty.repository';
import { LoyaltyAccount } from '../../domain/entities/loyalty-account.entity';

describe('EnrollCustomerUseCase', () => {
  let findByCustomerId: jest.MockedFunction<LoyaltyRepository['findByCustomerId']>;
  let createIfAbsent: jest.MockedFunction<LoyaltyRepository['createIfAbsent']>;
  let useCase: EnrollCustomerUseCase;

  beforeEach(() => {
    findByCustomerId = jest.fn() as jest.MockedFunction<LoyaltyRepository['findByCustomerId']>;
    createIfAbsent = jest.fn() as jest.MockedFunction<LoyaltyRepository['createIfAbsent']>;
    createIfAbsent.mockResolvedValue(undefined);

    const repo: LoyaltyRepository = {
      findByCustomerId,
      createIfAbsent,
      earn: jest.fn() as jest.MockedFunction<LoyaltyRepository['earn']>,
    };
    useCase = new EnrollCustomerUseCase(repo);
  });

  it('creates the account on the customer first order', async () => {
    findByCustomerId.mockResolvedValue(null);

    await useCase.ensureAccount('c-1');

    expect(createIfAbsent).toHaveBeenCalledWith('c-1');
  });

  it('is a no-op when the account already exists (later orders never duplicate)', async () => {
    findByCustomerId.mockResolvedValue(
      new LoyaltyAccount('la-1', 'c-1', 0, false, null, new Date(), new Date()),
    );

    await useCase.ensureAccount('c-1');

    expect(createIfAbsent).not.toHaveBeenCalled();
  });
});
