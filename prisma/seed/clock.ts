// One reference instant per seed run, so "7 days ago" means the same moment in every
// table. Rows that must stay ordered relative to each other (order -> payment -> earn)
// are offset from the same anchor instead of calling new Date() at each insert.
export const SEED_NOW = new Date();

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

export function daysAgo(days: number, plusMinutes = 0): Date {
  return new Date(SEED_NOW.getTime() - days * DAY_MS + plusMinutes * MINUTE_MS);
}

export function daysAhead(days: number): Date {
  return new Date(SEED_NOW.getTime() + days * DAY_MS);
}

/** Loyalty points expire 12 months after the EARN that created the lot. */
export function twelveMonthsAfter(date: Date): Date {
  const expiry = new Date(date);
  expiry.setMonth(expiry.getMonth() + 12);
  return expiry;
}
