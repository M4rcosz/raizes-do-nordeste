import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { EarnPointsUseCase } from './earn-points.use-case';
import type { LoyaltyRepository } from '../../domain/repositories/loyalty.repository';
import { LoyaltyAccount } from '../../domain/entities/loyalty-account.entity';

const TX = Symbol('tx');

const buildAccount = (consentGiven: boolean): LoyaltyAccount =>
  new LoyaltyAccount('la-1', 'c-1', 10, consentGiven, null, new Date(), new Date());

describe('EarnPointsUseCase', () => {
  let findByCustomerId: jest.MockedFunction<LoyaltyRepository['findByCustomerId']>;
  let earn: jest.MockedFunction<LoyaltyRepository['earn']>;
  let useCase: EarnPointsUseCase;

  beforeEach(() => {
    findByCustomerId = jest.fn() as jest.MockedFunction<LoyaltyRepository['findByCustomerId']>;
    earn = jest.fn() as jest.MockedFunction<LoyaltyRepository['earn']>;
    earn.mockResolvedValue(undefined);

    const repo: LoyaltyRepository = {
      findByCustomerId,
      createIfAbsent: jest.fn() as jest.MockedFunction<LoyaltyRepository['createIfAbsent']>,
      earn,
    };
    useCase = new EarnPointsUseCase(repo);
  });

  it('credits floor(amount / 10) points on the caller tx when consent was given', async () => {
    findByCustomerId.mockResolvedValue(buildAccount(true));

    await useCase.earnForOrder({ customerId: 'c-1', orderId: 'o-1', totalAmount: '25.00' }, TX);

    expect(findByCustomerId).toHaveBeenCalledWith('c-1', TX);
    expect(earn).toHaveBeenCalledWith(
      {
        loyaltyAccountId: 'la-1',
        orderId: 'o-1',
        points: 2,
        description: 'Points earned for order o-1',
      },
      TX,
    );
  });

  it('is a no-op without consent (LGPD gate)', async () => {
    findByCustomerId.mockResolvedValue(buildAccount(false));

    await useCase.earnForOrder({ customerId: 'c-1', orderId: 'o-1', totalAmount: '25.00' }, TX);

    expect(earn).not.toHaveBeenCalled();
  });

  it('is a no-op when the customer has no account', async () => {
    findByCustomerId.mockResolvedValue(null);

    await useCase.earnForOrder({ customerId: 'c-1', orderId: 'o-1', totalAmount: '25.00' }, TX);

    expect(earn).not.toHaveBeenCalled();
  });

  it('never records a zero-point EARN (amount below R$10)', async () => {
    findByCustomerId.mockResolvedValue(buildAccount(true));

    await useCase.earnForOrder({ customerId: 'c-1', orderId: 'o-1', totalAmount: '9.99' }, TX);

    expect(earn).not.toHaveBeenCalled();
  });
});
