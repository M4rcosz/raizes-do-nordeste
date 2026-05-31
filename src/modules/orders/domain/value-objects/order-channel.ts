export const OrderChannel = {
  APP: 'APP',
  WEB: 'WEB',
  TOTEM: 'TOTEM',
  COUNTER: 'COUNTER',
  PICKUP: 'PICKUP',
} as const;

export type OrderChannel = (typeof OrderChannel)[keyof typeof OrderChannel];

type CustomerSource = 'authenticated' | 'anonymous' | 'from-request';

interface ChannelPolicy {
  requiresAttendant: boolean;
  customerSource: CustomerSource;
}

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
