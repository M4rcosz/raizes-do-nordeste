import { Money } from '@shared/domain/value-objects/money';

export interface EligibilityInput {
  now: Date;
  subtotal: Money;
  isActive: boolean;
  startDate: Date;
  endDate: Date;
  minOrderValue: Money;
}

/**
 * Pure eligibility policy for a promotion against a candidate order. No money is
 * priced here - this only answers "does this promotion apply at all?". Pricing is
 * DiscountType's job.
 *
 * Date window is closed on the left, open on the right: [startDate, endDate). now ==
 * startDate qualifies (the promotion is live from its first instant); now == endDate
 * does not (the end instant is the first instant it is over). This avoids a one-second
 * overlap if a later promotion starts exactly when this one ends.
 */
export function isEligible(input: EligibilityInput): boolean {
  const { now, subtotal, isActive, startDate, endDate, minOrderValue } = input;

  if (!isActive) {
    return false;
  }
  if (now.getTime() < startDate.getTime() || now.getTime() >= endDate.getTime()) {
    return false;
  }
  if (subtotal.lessThan(minOrderValue)) {
    return false;
  }
  return true;
}
