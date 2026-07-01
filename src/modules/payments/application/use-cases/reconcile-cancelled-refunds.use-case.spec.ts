import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ReconcileCancelledRefundsUseCase } from './reconcile-cancelled-refunds.use-case';
import type { PaymentRepository } from '../../domain/repositories/payment.repository';
import type { PaymentRefund } from '../ports/payment-refund.port';

describe('ReconcileCancelledRefundsUseCase', () => {
  let findOwed: jest.MockedFunction<PaymentRepository['findApprovedOrderIdsForCancelledOrders']>;
  let refundForOrder: jest.MockedFunction<PaymentRefund['refundForOrder']>;
  let useCase: ReconcileCancelledRefundsUseCase;

  beforeEach(() => {
    findOwed = jest.fn() as jest.MockedFunction<
      PaymentRepository['findApprovedOrderIdsForCancelledOrders']
    >;
    refundForOrder = jest.fn() as jest.MockedFunction<PaymentRefund['refundForOrder']>;

    const payments = {
      findApprovedOrderIdsForCancelledOrders: findOwed,
    } as unknown as PaymentRepository;
    const refund = { refundForOrder } as PaymentRefund;

    useCase = new ReconcileCancelledRefundsUseCase(payments, refund);
  });

  it('re-runs the idempotent refund for every owed order and counts the completed ones', async () => {
    findOwed.mockResolvedValue(['o-1', 'o-2', 'o-3']);
    refundForOrder
      .mockResolvedValueOnce('refunded')
      .mockResolvedValueOnce('failed') // gateway still down: stays owed for next sweep
      .mockResolvedValueOnce('refunded');

    const refunded = await useCase.execute();

    expect(refundForOrder).toHaveBeenNthCalledWith(1, 'o-1');
    expect(refundForOrder).toHaveBeenNthCalledWith(2, 'o-2');
    expect(refundForOrder).toHaveBeenNthCalledWith(3, 'o-3');
    expect(refunded).toBe(2);
  });

  it('does nothing when no refund is owed', async () => {
    findOwed.mockResolvedValue([]);

    const refunded = await useCase.execute();

    expect(refunded).toBe(0);
    expect(refundForOrder).not.toHaveBeenCalled();
  });
});
