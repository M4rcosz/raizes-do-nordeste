import { Injectable } from '@nestjs/common';
import Big from 'big.js';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import {
  PaymentGatewayError,
  type ChargeRequest,
  type ChargeResult,
  type PaymentGateway,
} from '../../application/ports/payment-gateway.port';
import { PaymentStatus } from '../../domain/value-objects/payment-status';

/** Charging exactly this amount is refused (settled via webhook), to drive the refusal path. */
const TEST_REFUSAL_AMOUNT = new Big('13.13');
/** Charging this amount fails outright with no money moved (definite gateway failure). */
const TEST_DEFINITE_FAILURE_AMOUNT = new Big('66.66');
/** Charging this amount fails with an unknown outcome (e.g. a timeout): money may have moved. */
const TEST_AMBIGUOUS_FAILURE_AMOUNT = new Big('77.77');

const SIMULATED_LATENCY_MS = 200;

@Injectable()
export class MockPaymentGateway implements PaymentGateway {
  /** Stands in for the PSP's idempotency store: same key -> same original result. */
  private readonly seen = new Map<string, ChargeResult>();

  async charge(amount: Big, request: ChargeRequest): Promise<ChargeResult> {
    const cached = this.seen.get(request.idempotencyKey);
    if (cached) {
      return cached;
    }

    await delay(SIMULATED_LATENCY_MS);

    if (amount.eq(TEST_DEFINITE_FAILURE_AMOUNT)) {
      throw new PaymentGatewayError('Mock gateway: charge declined before any capture.', false);
    }
    if (amount.eq(TEST_AMBIGUOUS_FAILURE_AMOUNT)) {
      throw new PaymentGatewayError(
        'Mock gateway: charge timed out with an unknown outcome.',
        true,
      );
    }

    const approved = !amount.eq(TEST_REFUSAL_AMOUNT);
    const status = approved ? PaymentStatus.APPROVED : PaymentStatus.REFUSED;

    const result: ChargeResult = {
      extTransactionId: `mock_${randomUUID()}`,
      status,
      raw: { amount: amount.toFixed(2), status, orderId: request.orderId },
    };

    this.seen.set(request.idempotencyKey, result);
    return result;
  }
}
