import { Inject, Injectable, Logger } from '@nestjs/common';
import Big from 'big.js';
import { UserRole } from '@modules/identity/domain/value-objects/user-role';
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
import { Payment } from '../../domain/entities/payment.entity';
import type { PaymentMethod } from '../../domain/value-objects/payment-method';
import { PaymentStatus } from '../../domain/value-objects/payment-status';
import {
  PAYMENT_REPOSITORY,
  type PaymentRepository,
} from '../../domain/repositories/payment.repository';
import {
  PAYMENT_GATEWAY,
  PaymentGatewayError,
  type ChargeResult,
  type PaymentGateway,
} from '../ports/payment-gateway.port';
import { OrderNotFoundError } from '../errors/order-not-found.error';
import { OrderNotPayableError } from '../errors/order-not-payable.error';
import { PaymentChargeFailedError } from '../errors/payment-charge-failed.error';
import type { PaymentRequester } from './find-payment-by-order.use-case';

export interface CreatePaymentCommand {
  orderId: string;
  method: PaymentMethod;
}

@Injectable()
export class CreatePaymentUseCase {
  private readonly logger = new Logger(CreatePaymentUseCase.name);

  constructor(
    @Inject(PAYMENT_REPOSITORY)
    private readonly payments: PaymentRepository,
    @Inject(PAYMENT_GATEWAY)
    private readonly gateway: PaymentGateway,
    @Inject(ORDER_FOR_PAYMENT)
    private readonly orders: OrderForPayment,
    @Inject(AUDIT_LOGGER)
    private readonly audit: AuditLogger,
  ) {}

  async execute(command: CreatePaymentCommand, requester: PaymentRequester): Promise<Payment> {
    const order = await this.orders.findForPayment(command.orderId);
    if (!order) {
      throw new OrderNotFoundError(`Order ${command.orderId} was not found.`);
    }

    // Customer pays only their own order; staff pays any. Non-owner gets the same
    // 404 as missing, so it never leaks that the order exists.
    if (requester.role === UserRole.CUSTOMER && order.customerId !== requester.id) {
      throw new OrderNotFoundError(`Order ${command.orderId} was not found.`);
    }

    if (!order.isAwaitingPayment) {
      throw new OrderNotPayableError(`Order ${command.orderId} is not awaiting payment.`);
    }

    // Pre-check for a nicer error; the unique index in `create` is the real race guard.
    const active = await this.payments.findActiveByOrderId(command.orderId);
    if (active) {
      throw new OrderNotPayableError(
        `Order ${command.orderId} already has a payment in progress or settled.`,
      );
    }

    // Reserve before charging: the "one live attempt per order" index makes a concurrent
    // reserve fail here (P2002), so the gateway is charged once. Amount comes from the
    // order total, never from the request body.
    const reserved = await this.payments.create({
      orderId: command.orderId,
      amount: order.totalAmount,
      method: command.method,
      status: PaymentStatus.PENDING,
      extTransactionId: null,
    });

    let result: ChargeResult;
    try {
      result = await this.gateway.charge(new Big(order.totalAmount), {
        orderId: command.orderId,
        idempotencyKey: reserved.id,
      });
    } catch (err) {
      throw await this.handleChargeFailure(err, command.orderId, reserved.id, requester.id);
    }

    // Save as PROCESSING; the webhook delivers the final APPROVED/REFUSED status.
    let payment: Payment;
    try {
      payment = await this.payments.markCharged({
        id: reserved.id,
        status: PaymentStatus.PROCESSING,
        extTransactionId: result.extTransactionId,
        gatewayRequest: { amount: order.totalAmount, idempotencyKey: reserved.id },
        gatewayResponse: result.raw,
      });
    } catch (err) {
      // Charge succeeded but recording it failed: without the extTransactionId the webhook
      // can never match this attempt. Best-effort move it to PROCESSING so the sweeper (which
      // only cancels PENDING reservations) cannot free its slot and let a retry double-charge;
      // the slot stays held for reconciliation. An Outbox is the real fix (charge + persist
      // atomically); until then, flag the orphan so ops can reconcile from the gateway id.
      await this.holdForReconciliation(reserved.id);
      await this.logBestEffort({
        userId: requester.id,
        action: AUDIT_ACTIONS.PAYMENT_RECONCILE_REQUIRED,
        entity: 'Payment',
        entityId: reserved.id,
        metadata: {
          orderId: command.orderId,
          extTransactionId: result.extTransactionId,
          reason: 'charge succeeded but persisting the PROCESSING status failed',
        },
      });
      throw err;
    }

    // Payment is already charged; a failed audit write must not 500 the caller.
    await this.logBestEffort({
      userId: requester.id,
      action: AUDIT_ACTIONS.PAYMENT_CREATED,
      entity: 'Payment',
      entityId: payment.id,
      metadata: { orderId: command.orderId, amount: order.totalAmount, method: command.method },
    });

    return payment;
  }

  private async logBestEffort(input: AuditLogInput): Promise<void> {
    try {
      await this.audit.log(input);
    } catch (err) {
      this.logger.error(`Failed to write audit ${input.action} for ${input.entityId}`, err);
    }
  }

  // Best-effort: hold a charged-but-unrecorded attempt's slot by moving it to PROCESSING,
  // which the sweeper leaves alone. If even this write fails the attempt stays PENDING and the
  // reconcile audit log is the only safety net.
  private async holdForReconciliation(paymentId: string): Promise<void> {
    try {
      await this.payments.updateStatus({ id: paymentId, status: PaymentStatus.PROCESSING });
    } catch (err) {
      this.logger.error(`Failed to hold payment ${paymentId} for reconciliation`, err);
    }
  }

  /**
   * Resolves a failed charge into the attempt's next state and the error to surface.
   * Definite failure: no money moved, so cancel the attempt and free its slot for retry.
   * Ambiguous failure (e.g. timeout): money may have moved, so move the attempt to
   * PROCESSING (the sweeper leaves PROCESSING alone) and flag it for reconciliation; the
   * held slot blocks a blind retry, so the caller cannot double-charge. Returns the error
   * to throw so the caller's control flow ends at the `throw`.
   */
  private async handleChargeFailure(
    err: unknown,
    orderId: string,
    paymentId: string,
    userId: string,
  ): Promise<PaymentChargeFailedError> {
    // Only free the slot when the gateway explicitly says no money moved. Everything else
    // (an ambiguous gateway failure, or any unexpected error) is treated as ambiguous and
    // kept for reconciliation - never auto-freed, so we cannot double-charge.
    const definite = err instanceof PaymentGatewayError && !err.ambiguous;

    if (definite) {
      await this.payments.updateStatus({ id: paymentId, status: PaymentStatus.CANCELLED });
    } else {
      await this.payments.updateStatus({ id: paymentId, status: PaymentStatus.PROCESSING });
      await this.logBestEffort({
        userId,
        action: AUDIT_ACTIONS.PAYMENT_RECONCILE_REQUIRED,
        entity: 'Payment',
        entityId: paymentId,
        metadata: { orderId, reason: 'charge failed with an unknown outcome' },
      });
    }

    return new PaymentChargeFailedError(
      `Charging order ${orderId} failed${definite ? '' : ' with an unknown outcome'}.`,
      !definite,
      { cause: err },
    );
  }
}
