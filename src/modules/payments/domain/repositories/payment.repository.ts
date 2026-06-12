import type { TransactionContext } from '@shared/transaction/transaction-runner.port';
import { Payment } from '../entities/payment.entity';
import type { PaymentMethod } from '../value-objects/payment-method';
import { PaymentStatus } from '../value-objects/payment-status';

export interface CreatePaymentInput {
  orderId: string;
  amount: string;
  method: PaymentMethod;
  status: PaymentStatus;
  extTransactionId: string | null;
  gatewayResponse?: Record<string, unknown>;
}

/** Attaches the gateway's outcome to a reserved attempt once the charge returns. */
export interface MarkChargedInput {
  id: string;
  status: PaymentStatus;
  extTransactionId: string;
  gatewayRequest?: Record<string, unknown>;
  gatewayResponse?: Record<string, unknown>;
}

export interface UpdatePaymentStatusInput {
  id: string;
  status: PaymentStatus;
}

export interface SettlePaymentInput {
  id: string;
  status: typeof PaymentStatus.APPROVED | typeof PaymentStatus.REFUSED;
}

export interface PaymentRepository {
  /**
   * Inserts a payment attempt. The partial unique index ("one live attempt per
   * order") makes a concurrent second insert fail with P2002, which the adapter
   * maps to `OrderNotPayableError` - this is the real double-charge guard.
   */
  create(input: CreatePaymentInput, tx?: TransactionContext): Promise<Payment>;
  /** The single live attempt for an order (PENDING/PROCESSING/APPROVED), if any. */
  findActiveByOrderId(orderId: string): Promise<Payment | null>;
  /** The most recent attempt for an order, regardless of status (for the GET endpoint). */
  findCurrentByOrderId(orderId: string): Promise<Payment | null>;
  findByExtTransactionId(extTransactionId: string): Promise<Payment | null>;
  markCharged(input: MarkChargedInput, tx?: TransactionContext): Promise<Payment>;
  updateStatus(input: UpdatePaymentStatusInput, tx?: TransactionContext): Promise<Payment>;
  /**
   * Settles a still-settleable attempt (PENDING/PROCESSING) to APPROVED/REFUSED with an
   * optimistic guard. Returns `null` when no row matched - another webhook delivery already
   * settled it - so the caller can treat the redelivery as an idempotent no-op.
   */
  settle(input: SettlePaymentInput, tx?: TransactionContext): Promise<Payment | null>;
  /**
   * Cancels abandoned reservations: still PENDING, never charged (no extTransactionId) and
   * older than `olderThan`. Frees their live-attempt slot so the order can be paid again.
   * Deliberately never touches PROCESSING attempts (charge may have moved money) - those
   * need reconciliation, not auto-cancel. Returns how many rows were cancelled.
   */
  cancelStaleReservations(olderThan: Date): Promise<number>;
}

export const PAYMENT_REPOSITORY = Symbol('PaymentRepository');
