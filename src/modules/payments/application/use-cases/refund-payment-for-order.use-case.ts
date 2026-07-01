import { Inject, Injectable, Logger } from '@nestjs/common';
import { AUDIT_LOGGER, type AuditLogger } from '@modules/audit/application/ports/audit-logger.port';
import { AUDIT_ACTIONS } from '@modules/audit/domain/audit-actions';
import {
  PAYMENT_REPOSITORY,
  type PaymentRepository,
} from '../../domain/repositories/payment.repository';
import { PaymentStatus } from '../../domain/value-objects/payment-status';
import { PAYMENT_GATEWAY, type PaymentGateway } from '../ports/payment-gateway.port';
import { type PaymentRefund, type RefundOutcome } from '../ports/payment-refund.port';

/**
 * Implements the PAYMENT_REFUND port. Reverses an order's approved charge at the gateway
 * and marks the payment REFUNDED. The gateway call is external, so it runs outside any
 * order transaction. On a gateway failure it does not throw: it flags the payment for
 * reconciliation and reports `failed`, so the cancellation still proceeds.
 */
@Injectable()
export class RefundPaymentForOrderUseCase implements PaymentRefund {
  private readonly logger = new Logger(RefundPaymentForOrderUseCase.name);

  constructor(
    @Inject(PAYMENT_REPOSITORY)
    private readonly payments: PaymentRepository,
    @Inject(PAYMENT_GATEWAY)
    private readonly gateway: PaymentGateway,
    @Inject(AUDIT_LOGGER)
    private readonly audit: AuditLogger,
  ) {}

  async refundForOrder(orderId: string): Promise<RefundOutcome> {
    const payment = await this.payments.findActiveByOrderId(orderId);

    // Only a settled (APPROVED) charge moved money. A PENDING/PROCESSING attempt has
    // nothing to reverse here - the stale-reservation sweeper/reconciliation owns those.
    if (!payment || payment.status !== PaymentStatus.APPROVED || !payment.extTransactionId) {
      return 'no-payment';
    }

    try {
      await this.gateway.refund({ extTransactionId: payment.extTransactionId, orderId });
    } catch (err) {
      this.logger.error(
        `Refund failed for order ${orderId}; flagging payment ${payment.id} for reconciliation`,
        err instanceof Error ? err.stack : String(err),
      );
      await this.audit.log({
        userId: null,
        action: AUDIT_ACTIONS.PAYMENT_RECONCILE_REQUIRED,
        entity: 'Payment',
        entityId: payment.id,
        metadata: { orderId, reason: 'refund failed during order cancellation' },
      });
      return 'failed';
    }

    await this.payments.updateStatus({ id: payment.id, status: PaymentStatus.REFUNDED });
    await this.audit.log({
      userId: null,
      action: AUDIT_ACTIONS.PAYMENT_REFUNDED,
      entity: 'Payment',
      entityId: payment.id,
      metadata: { orderId },
    });
    return 'refunded';
  }
}
