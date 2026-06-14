import { Inject, Injectable } from '@nestjs/common';
import {
  LOYALTY_REPOSITORY,
  type LoyaltyRepository,
} from '../../domain/repositories/loyalty.repository';
import type { LoyaltyEnrollment } from '../ports/loyalty-enrollment.port';

/**
 * Implements the LOYALTY_ENROLLMENT port (RN-30): the account appears on the
 * customer's first order and later orders are no-ops. The adapter swallows the
 * unique-violation race, so two simultaneous first orders still end with one account.
 */
@Injectable()
export class EnrollCustomerUseCase implements LoyaltyEnrollment {
  constructor(
    @Inject(LOYALTY_REPOSITORY)
    private readonly accounts: LoyaltyRepository,
  ) {}

  async ensureAccount(customerId: string): Promise<void> {
    const existing = await this.accounts.findByCustomerId(customerId);
    if (existing) {
      return;
    }
    await this.accounts.createIfAbsent(customerId);
  }
}
