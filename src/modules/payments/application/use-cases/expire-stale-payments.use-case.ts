import { Inject, Injectable } from '@nestjs/common';
import {
  PAYMENT_REPOSITORY,
  type PaymentRepository,
} from '../../domain/repositories/payment.repository';

@Injectable()
export class ExpireStalePaymentsUseCase {
  constructor(
    @Inject(PAYMENT_REPOSITORY)
    private readonly payments: PaymentRepository,
  ) {}

  /**
   * Cancels reservations abandoned before the gateway was charged (still PENDING, never
   * charged) older than `olderThanMs`, freeing their live-attempt slot. Only safe because
   * the repository never sweeps PROCESSING attempts, where money may have moved. Returns
   * how many were cancelled. `now` is injectable so tests control the clock.
   */
  async execute(olderThanMs: number, now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - olderThanMs);
    return this.payments.cancelStaleReservations(cutoff);
  }
}
