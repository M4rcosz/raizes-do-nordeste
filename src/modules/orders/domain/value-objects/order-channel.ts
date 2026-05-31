export const OrderChannel = {
  APP: 'APP',
  WEB: 'WEB',
  TOTEM: 'TOTEM',
  COUNTER: 'COUNTER',
  PICKUP: 'PICKUP',
} as const;

export type OrderChannel = (typeof OrderChannel)[keyof typeof OrderChannel];

/**
 * Where the order's customer comes from:
 * - `authenticated`: the logged-in user placing the order (APP, WEB).
 * - `anonymous`: no customer is attached — a walk-up self-service order (TOTEM).
 * - `from-request`: a staff member supplies the customer in the request body (COUNTER, PICKUP).
 */
type CustomerSource = 'authenticated' | 'anonymous' | 'from-request';

interface ChannelPolicy {
  requiresAttendant: boolean;
  customerSource: CustomerSource;
}

/**
 * Per-channel rules: whether a staff attendant must place the order, and how its
 * customer is resolved. This table is the single source of truth — callers ask via
 * the helpers below instead of branching on the channel.
 */
const POLICIES: Record<OrderChannel, ChannelPolicy> = {
  APP: { requiresAttendant: false, customerSource: 'authenticated' },
  WEB: { requiresAttendant: false, customerSource: 'authenticated' },
  TOTEM: { requiresAttendant: false, customerSource: 'anonymous' },
  COUNTER: { requiresAttendant: true, customerSource: 'from-request' },
  PICKUP: { requiresAttendant: true, customerSource: 'from-request' },
};

export const channelRequiresAttendant = (c: OrderChannel): boolean => POLICIES[c].requiresAttendant;
export const channelCustomerSource = (c: OrderChannel): CustomerSource =>
  POLICIES[c].customerSource;
