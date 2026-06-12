import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ExpireStalePaymentsUseCase } from './expire-stale-payments.use-case';
import type { PaymentRepository } from '../../domain/repositories/payment.repository';

describe('ExpireStalePaymentsUseCase', () => {
  let cancelStaleReservations: jest.MockedFunction<PaymentRepository['cancelStaleReservations']>;
  let useCase: ExpireStalePaymentsUseCase;

  beforeEach(() => {
    cancelStaleReservations = jest.fn() as jest.MockedFunction<
      PaymentRepository['cancelStaleReservations']
    >;
    const repo = { cancelStaleReservations } as unknown as PaymentRepository;
    useCase = new ExpireStalePaymentsUseCase(repo);
  });

  it('cancels reservations older than now minus the ttl, returning the count', async () => {
    cancelStaleReservations.mockResolvedValue(2);
    const now = new Date('2026-06-07T12:00:00Z');

    const count = await useCase.execute(15 * 60_000, now);

    expect(cancelStaleReservations).toHaveBeenCalledWith(new Date('2026-06-07T11:45:00Z'));
    expect(count).toBe(2);
  });
});
