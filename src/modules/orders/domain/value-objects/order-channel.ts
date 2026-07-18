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
 * - `anonymous`: no customer is attached - a walk-up self-service order (TOTEM).
 * - `from-request`: a staff member supplies the customer in the request body (COUNTER, PICKUP).
 */
type CustomerSource = 'authenticated' | 'anonymous' | 'from-request';

/**
 * Whether a guest display name may/must accompany the order:
 * - `forbidden`: the account behind the order is the name (APP, WEB).
 * - `required`: nobody is logged in, so a name is the only way to call the order (TOTEM).
 * - `required-without-customer`: a name only when no customer account is attached
 *   (COUNTER, PICKUP). Exactly one of customerId/customerName is ever populated.
 */
type GuestNamePolicy = 'forbidden' | 'required' | 'required-without-customer';

interface ChannelPolicy {
  requiresAttendant: boolean;
  customerSource: CustomerSource;
  guestName: GuestNamePolicy;
}

/**
 * Per-channel rules: whether a staff attendant must place the order, and how its
 * customer is resolved. This table is the single source of truth - callers ask via
 * the helpers below instead of branching on the channel.
 */
const POLICIES: Record<OrderChannel, ChannelPolicy> = {
  APP: { requiresAttendant: false, customerSource: 'authenticated', guestName: 'forbidden' },
  WEB: { requiresAttendant: false, customerSource: 'authenticated', guestName: 'forbidden' },
  TOTEM: { requiresAttendant: false, customerSource: 'anonymous', guestName: 'required' },
  COUNTER: {
    requiresAttendant: true,
    customerSource: 'from-request',
    guestName: 'required-without-customer',
  },
  PICKUP: {
    requiresAttendant: true,
    customerSource: 'from-request',
    guestName: 'required-without-customer',
  },
};

export const channelRequiresAttendant = (c: OrderChannel): boolean => POLICIES[c].requiresAttendant;
export const channelCustomerSource = (c: OrderChannel): CustomerSource =>
  POLICIES[c].customerSource;
export const channelGuestNamePolicy = (c: OrderChannel): GuestNamePolicy => POLICIES[c].guestName;
