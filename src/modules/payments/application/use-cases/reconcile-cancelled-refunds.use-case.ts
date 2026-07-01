import { Inject, Injectable } from '@nestjs/common';
import {
  PAYMENT_REPOSITORY,
  type PaymentRepository,
} from '../../domain/repositories/payment.repository';
import { PAYMENT_REFUND, type PaymentRefund } from '../ports/payment-refund.port';

/**
 * Closes the cancellation saga's durability gap: an APPROVED payment on a CANCELLED order
 * means a refund was owed but never completed (the process crashed between the cancel
 * commit and the refund call, or the gateway refund failed earlier). This re-runs the
 * idempotent refund for each such order; a success settles the payment to REFUNDED, so it
 * stops matching on the next pass. Returns how many refunds completed this run.
 */
@Injectable()
export class ReconcileCancelledRefundsUseCase {
  constructor(
    @Inject(PAYMENT_REPOSITORY)
    private readonly payments: PaymentRepository,
    @Inject(PAYMENT_REFUND)
    private readonly refund: PaymentRefund,
  ) {}

  async execute(): Promise<number> {
    const orderIds = await this.payments.findApprovedOrderIdsForCancelledOrders();

    let refunded = 0;
    for (const orderId of orderIds) {
      const outcome = await this.refund.refundForOrder(orderId);
      if (outcome === 'refunded') {
        refunded += 1;
      }
    }
    return refunded;
  }
}
