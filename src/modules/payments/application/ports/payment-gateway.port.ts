import type { Money } from '@shared/domain/value-objects/money';
import type { PaymentStatus } from '../../domain/value-objects/payment-status';

export const PAYMENT_GATEWAY = Symbol('PaymentGateway');

export interface ChargeRequest {
  orderId: string;
  /**
   * Per-attempt idempotency key (the payment attempt id). The gateway de-dupes on it:
   * the same key charged twice yields one charge and the original result. This is what
   * makes a retried charge call safe (network timeout, client retry).
   */
  idempotencyKey: string;
}

export interface ChargeResult {
  /** The gateway's own transaction id, echoed back later by its webhook. */
  extTransactionId: string;
  /**
   * The gateway's synchronous decision. The webhook is what ultimately applies the
   * outcome to us, so the create flow does NOT consume this field - it persists the
   * attempt as PROCESSING and waits for the webhook (mirrors Stripe/Mercado Pago).
   */
  status: typeof PaymentStatus.APPROVED | typeof PaymentStatus.REFUSED;
  raw: Record<string, unknown>;
}

export interface RefundRequest {
  /** The gateway transaction id of the original (approved) charge. */
  extTransactionId: string;
  orderId: string;
}

export interface RefundResult {
  /** The gateway's own refund id. */
  extRefundId: string;
  raw: Record<string, unknown>;
}

export interface PaymentGateway {
  charge(amount: Money, request: ChargeRequest): Promise<ChargeResult>;
  /**
   * Reverses an approved charge. Throws PaymentGatewayError on a technical failure so the
   * caller can flag the payment for manual reconciliation rather than treat it as refunded.
   */
  refund(request: RefundRequest): Promise<RefundResult>;
}

/**
 * Raised by a gateway adapter when a charge call fails (technical failure, not a business
 * decline - declines come back as a REFUSED outcome via the webhook). `ambiguous` is the
 * decisive flag: when true the charge may or may not have moved money (e.g. a timeout), so
 * the attempt must be kept (slot held) for reconciliation rather than freed for retry.
 */
export class PaymentGatewayError extends Error {
  constructor(
    message: string,
    readonly ambiguous: boolean,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}
