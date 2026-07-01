import { Injectable } from '@nestjs/common';
import { Money } from '@shared/domain/value-objects/money';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import {
  PaymentGatewayError,
  type ChargeRequest,
  type ChargeResult,
  type PaymentGateway,
  type RefundRequest,
  type RefundResult,
} from '../../application/ports/payment-gateway.port';
import { PaymentStatus } from '../../domain/value-objects/payment-status';

/** Charging exactly this amount is refused (settled via webhook), to drive the refusal path. */
const TEST_REFUSAL_AMOUNT = Money.fromDecimalString('13.13');
/** Charging this amount fails outright with no money moved (definite gateway failure). */
const TEST_DEFINITE_FAILURE_AMOUNT = Money.fromDecimalString('66.66');
/** Charging this amount fails with an unknown outcome (e.g. a timeout): money may have moved. */
const TEST_AMBIGUOUS_FAILURE_AMOUNT = Money.fromDecimalString('77.77');

const SIMULATED_LATENCY_MS = 200;

@Injectable()
export class MockPaymentGateway implements PaymentGateway {
  /** Stands in for the PSP's idempotency store: same key -> same original result. */
  private readonly seen = new Map<string, ChargeResult>();

  async charge(amount: Money, request: ChargeRequest): Promise<ChargeResult> {
    const cached = this.seen.get(request.idempotencyKey);
    if (cached) {
      return cached;
    }

    await delay(SIMULATED_LATENCY_MS);

    if (amount.equals(TEST_DEFINITE_FAILURE_AMOUNT)) {
      throw new PaymentGatewayError('Mock gateway: charge declined before any capture.', false);
    }
    if (amount.equals(TEST_AMBIGUOUS_FAILURE_AMOUNT)) {
      throw new PaymentGatewayError(
        'Mock gateway: charge timed out with an unknown outcome.',
        true,
      );
    }

    const approved = !amount.equals(TEST_REFUSAL_AMOUNT);
    const status = approved ? PaymentStatus.APPROVED : PaymentStatus.REFUSED;

    const result: ChargeResult = {
      extTransactionId: `mock_${randomUUID()}`,
      status,
      raw: { amount: amount.toDecimalString(), status, orderId: request.orderId },
    };

    this.seen.set(request.idempotencyKey, result);
    return result;
  }

  async refund(request: RefundRequest): Promise<RefundResult> {
    await delay(SIMULATED_LATENCY_MS);

    // A transaction id carrying this marker simulates a refund that fails at the gateway,
    // to drive the reconciliation path. Everything else refunds cleanly.
    if (request.extTransactionId.includes('refund-fail')) {
      throw new PaymentGatewayError('Mock gateway: refund could not be processed.', true);
    }

    return {
      extRefundId: `mock_refund_${randomUUID()}`,
      raw: {
        extTransactionId: request.extTransactionId,
        orderId: request.orderId,
        status: 'refunded',
      },
    };
  }
}
