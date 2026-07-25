// Seed money is integer cents and only becomes a string at the Prisma border.
// Deliberately not the Money VO: money.ts is the only file allowed to import big.js,
// and the seed is a script outside the application layers.

/** 2350 -> "23.50". Built from integer parts, so no float ever touches an amount. */
export function toDecimalString(cents: number): string {
  if (!Number.isInteger(cents)) {
    throw new Error(`Seed amounts must be integer cents, received: ${cents}.`);
  }

  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/**
 * Mirrors computeDiscount() in the promotions context: percentage of the subtotal,
 * or a flat amount, both capped at the subtotal. Rounding is half-up on the cent,
 * matching big.js's default at the output border.
 */
export function discountCents(
  type: 'PERCENTAGE' | 'FIXED_AMOUNT',
  subtotalCents: number,
  valueCents: number,
): number {
  const raw =
    type === 'PERCENTAGE' ? Math.round((subtotalCents * (valueCents / 100)) / 100) : valueCents;
  return Math.min(raw, subtotalCents);
}

/** Earning rate: 1 point per R$10 paid, fraction discarded (RN-31). */
export function pointsEarnedFor(paidCents: number): number {
  return Math.floor(paidCents / 1000);
}

/** Redemption rate: 1 point = R$0.10, mirroring the earn rate. */
export function redemptionValueCents(points: number): number {
  return points * 10;
}
