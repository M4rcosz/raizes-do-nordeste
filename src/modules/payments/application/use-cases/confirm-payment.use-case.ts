import { Inject, Injectable, Logger } from '@nestjs/common';
import { Money } from '@shared/domain/value-objects/money';
import {
  ORDER_FOR_PAYMENT,
  type OrderForPayment,
} from '@modules/orders/application/ports/order-for-payment.port';
import {
  AUDIT_LOGGER,
  type AuditLogger,
  type AuditLogInput,
} from '@modules/audit/application/ports/audit-logger.port';
import { AUDIT_ACTIONS } from '@modules/audit/domain/audit-actions';
import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '@shared/transaction/transaction-runner.port';
import { Payment } from '../../domain/entities/payment.entity';
import { PaymentStatus } from '../../domain/value-objects/payment-status';
import {
  PAYMENT_REPOSITORY,
  type PaymentRepository,
} from '../../domain/repositories/payment.repository';
import {
  LOYALTY_EARNING,
  type LoyaltyEarning,
} from '@modules/loyalty/application/ports/loyalty-earning.port';
export interface ConfirmPaymentCommand {
  extTransactionId: string;
  status: typeof PaymentStatus.APPROVED | typeof PaymentStatus.REFUSED;
  /** Amount the gateway settled, echoed in the webhook; must match what we charged. */
  amount: string;
}

@Injectable()
export class ConfirmPaymentUseCase {
  private readonly logger = new Logger(ConfirmPaymentUseCase.name);

  constructor(
    @Inject(PAYMENT_REPOSITORY)
    private readonly payments: PaymentRepository,
    @Inject(ORDER_FOR_PAYMENT)
    private readonly orders: OrderForPayment,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_LOGGER)
    private readonly audit: AuditLogger,
    @Inject(LOYALTY_EARNING)
    private readonly loyalty: LoyaltyEarning,
  ) {}

  async execute(command: ConfirmPaymentCommand): Promise<Payment | null> {
    const payment = await this.payments.findByExtTransactionId(command.extTransactionId);
    if (!payment) {
      // Unknown transaction: record for reconciliation and ack. Returning a non-2xx here
      // would make the gateway redeliver forever (e.g. for an orphan attempt whose
      // PROCESSING write was lost, which can never match, or an event from another env).
      await this.logBestEffort({
        userId: null,
        action: AUDIT_ACTIONS.PAYMENT_RECONCILE_REQUIRED,
        entity: 'Payment',
        entityId: command.extTransactionId,
        metadata: { reason: 'webhook for an unknown transaction', status: command.status },
      });
      return null;
    }

    // Webhooks can be redelivered: a payment already settled is returned unchanged.
    if (payment.status === PaymentStatus.APPROVED || payment.status === PaymentStatus.REFUSED) {
      return payment;
    }

    // Integrity: never settle on an amount that differs from what we charged. Flag it for
    // reconciliation (tampering, or a gateway/our-side bug) and ack without settling.
    if (!payment.amount.equals(Money.fromDecimalString(command.amount))) {
      await this.logBestEffort({
        userId: null,
        action: AUDIT_ACTIONS.PAYMENT_RECONCILE_REQUIRED,
        entity: 'Payment',
        entityId: payment.id,
        metadata: {
          orderId: payment.orderId,
          reason: 'webhook amount does not match the charged amount',
          expected: payment.amount.toDecimalString(),
          received: command.amount,
        },
      });
      return null;
    }

    const approved = command.status === PaymentStatus.APPROVED;

    // RN-31 needs the order's customer; read it up front so the transaction below
    // only writes. A missing view (order deleted) just means no points.
    const customerId = approved
      ? ((await this.orders.findForPayment(payment.orderId))?.customerId ?? null)
      : null;

    // Settle the payment and advance the order in one transaction. The order confirm is
    // best-effort: if it loses the optimistic lock the payment still settles, and we log
    // it for reconciliation below.
    const outcome = await this.transactions.run(async (tx) => {
      // If another webhook delivery already settled this payment, settle returns null,
      // so we skip the order confirm and audit.
      const next = await this.payments.settle({ id: payment.id, status: command.status }, tx);
      if (!next) {
        return { settled: false as const };
      }
      const confirmed = approved
        ? (await this.orders.confirmAfterPayment(payment.orderId, tx)) === 'confirmed'
        : false;

      // RN-31: points only for a confirmed order (a cancelled one settles but earns
      // nothing), credited atomically with the settlement. payment.amount is the
      // authoritative charged total. No account/consent is a no-op inside earnForOrder.
      if (confirmed && customerId) {
        await this.loyalty.earnForOrder(
          { customerId, orderId: payment.orderId, totalAmount: payment.amount.toDecimalString() },
          tx,
        );
      }

      return { settled: true as const, payment: next, orderConfirmed: confirmed };
    });

    if (!outcome.settled) {
      const current = await this.payments.findByExtTransactionId(command.extTransactionId);
      return current ?? payment;
    }

    const { payment: updated, orderConfirmed } = outcome;

    await this.logBestEffort({
      userId: null,
      action: approved ? AUDIT_ACTIONS.PAYMENT_APPROVED : AUDIT_ACTIONS.PAYMENT_REFUSED,
      entity: 'Payment',
      entityId: payment.id,
      metadata: { orderId: payment.orderId, status: command.status },
    });

    if (approved && !orderConfirmed) {
      await this.logBestEffort({
        userId: null,
        action: AUDIT_ACTIONS.PAYMENT_RECONCILE_REQUIRED,
        entity: 'Payment',
        entityId: payment.id,
        metadata: { orderId: payment.orderId, reason: 'order was not PENDING at approval' },
      });
    }

    return updated;
  }

  // A failed audit write must not 500 the webhook, or the gateway redelivers forever.
  // The payment is already settled, so log and move on (an Outbox would be the real fix).
  private async logBestEffort(input: AuditLogInput): Promise<void> {
    try {
      await this.audit.log(input);
    } catch (err) {
      this.logger.error(`Failed to write audit ${input.action} for ${input.entityId}`, err);
    }
  }
}
