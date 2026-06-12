import type Big from 'big.js';
import type { PaymentMethod } from '../value-objects/payment-method';
import type { PaymentStatus } from '../value-objects/payment-status';

export class Payment {
  constructor(
    public readonly id: string,
    public readonly orderId: string,
    public readonly amount: Big,
    public readonly method: PaymentMethod,
    public readonly status: PaymentStatus,
    public readonly extTransactionId: string | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}
}
