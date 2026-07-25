import {
  PrismaClient,
  type OrderChannel,
  type OrderStatus,
  type PaymentMethod,
  type PaymentStatus,
} from '@prisma/client';
import { seedId } from './ids';
import { SEED_NOW, daysAgo, twelveMonthsAfter } from './clock';
import { discountCents, pointsEarnedFor, redemptionValueCents, toDecimalString } from './money';
import type { Catalog, ProductKey, UnitKey } from './catalog';
import type { CustomerKey, People, StaffKey } from './people';
import type { Promotions, PromotionKey, ResolvedPromotion } from './promotions';

interface PaymentSpec {
  method: PaymentMethod;
  status: PaymentStatus;
  /** Offset from the order's own timestamp, so an attempt never predates its order. */
  minutesAfter: number;
}

interface OrderSpec {
  key: string;
  unit: UnitKey;
  channel: OrderChannel;
  status: OrderStatus;
  daysAgo: number;
  customer?: CustomerKey;
  guestName?: string;
  attendant?: StaffKey;
  items: { product: ProductKey; quantity: number; notes?: string }[];
  promotion?: PromotionKey;
  pointsRedeemed?: number;
  notes?: string;
  payments: PaymentSpec[];
}

// The order book. Every channel, every status, both identity shapes (account vs walk-up
// name), promoted and unpromoted, redeemed and not, single and retried payment.
// Products are always taken from the unit's own menu - a line for a product the unit
// does not sell would be unorderable through the API and so would be fiction here.
const ORDERS: OrderSpec[] = [
  {
    key: 'app-ana-delivered',
    unit: 'uberlandia',
    channel: 'APP',
    status: 'DELIVERED',
    daysAgo: 20,
    customer: 'ana',
    items: [
      { product: 'acaiPremium', quantity: 2, notes: 'No nuts on one' },
      { product: 'orangeJuice', quantity: 1 },
    ],
    promotion: 'comboWeek',
    payments: [{ method: 'PIX', status: 'APPROVED', minutesAfter: 2 }],
  },
  {
    key: 'web-bruno-delivered',
    unit: 'uberlandia',
    channel: 'WEB',
    status: 'DELIVERED',
    daysAgo: 14,
    customer: 'bruno',
    items: [
      { product: 'comboAcaiJuice', quantity: 1 },
      { product: 'fries', quantity: 1 },
    ],
    promotion: 'fiveOffForty',
    // Promotion and loyalty stack on one order: promo prices first, the redeemed
    // parcel comes off after, and only the promo parcel lands in OrderPromotion.
    pointsRedeemed: 20,
    payments: [{ method: 'CREDIT_CARD', status: 'APPROVED', minutesAfter: 3 }],
  },
  {
    key: 'totem-guest-ready',
    unit: 'uberlandia',
    channel: 'TOTEM',
    status: 'READY',
    daysAgo: 0,
    guestName: 'Marcos A.',
    items: [
      { product: 'acaiTradicional', quantity: 1 },
      { product: 'espresso', quantity: 1 },
    ],
    payments: [{ method: 'CASH', status: 'APPROVED', minutesAfter: 1 }],
  },
  {
    key: 'counter-guest-preparing',
    unit: 'uberlandia',
    channel: 'COUNTER',
    status: 'PREPARING',
    daysAgo: 0,
    attendant: 'rafael',
    guestName: 'Julia P.',
    notes: 'Table 4',
    items: [
      { product: 'coxinha', quantity: 3 },
      { product: 'water', quantity: 2 },
    ],
    payments: [{ method: 'PIX', status: 'PENDING', minutesAfter: 1 }],
  },
  {
    key: 'pickup-carla-confirmed',
    unit: 'uberlandia',
    channel: 'PICKUP',
    status: 'CONFIRMED',
    daysAgo: 0,
    attendant: 'rafael',
    customer: 'carla',
    items: [
      { product: 'acaiZero', quantity: 1 },
      { product: 'brigadeiro', quantity: 2 },
    ],
    promotion: 'fiveOffForty',
    payments: [{ method: 'PIX', status: 'APPROVED', minutesAfter: 4 }],
  },
  {
    key: 'app-ana-older-delivered',
    unit: 'uberlandia',
    channel: 'APP',
    status: 'DELIVERED',
    daysAgo: 45,
    customer: 'ana',
    items: [
      { product: 'acaiTradicional', quantity: 1 },
      { product: 'cappuccino', quantity: 1 },
    ],
    payments: [{ method: 'PIX', status: 'APPROVED', minutesAfter: 2 }],
  },
  {
    key: 'app-ana-recent-delivered',
    unit: 'uberlandia',
    channel: 'APP',
    status: 'DELIVERED',
    daysAgo: 2,
    customer: 'ana',
    items: [
      { product: 'comboAcaiJuice', quantity: 1 },
      { product: 'brigadeiro', quantity: 1 },
      { product: 'espresso', quantity: 1 },
    ],
    promotion: 'fiveOffForty',
    pointsRedeemed: 15,
    payments: [{ method: 'PIX', status: 'APPROVED', minutesAfter: 2 }],
  },
  {
    key: 'web-bruno-pending',
    unit: 'uberlandia',
    channel: 'WEB',
    status: 'PENDING',
    daysAgo: 0,
    customer: 'bruno',
    items: [{ product: 'acaiPremium', quantity: 1 }],
    payments: [{ method: 'PIX', status: 'PENDING', minutesAfter: 1 }],
  },
  {
    key: 'app-daniel-pending',
    unit: 'araguari',
    channel: 'APP',
    status: 'PENDING',
    daysAgo: 0,
    customer: 'daniel',
    items: [
      { product: 'grilledChicken', quantity: 1 },
      { product: 'coke', quantity: 1 },
    ],
    // Juice Day is live at Araguari and this subtotal clears it, so the order gets it
    // whether or not anyone asked: promotion application is automatic.
    promotion: 'juiceDay',
    payments: [{ method: 'PIX', status: 'PENDING', minutesAfter: 1 }],
  },
  {
    key: 'web-erika-cancelled',
    unit: 'araguari',
    channel: 'WEB',
    status: 'CANCELLED',
    daysAgo: 9,
    customer: 'erika',
    notes: 'Customer cancelled, refunded',
    items: [
      { product: 'chickenWrap', quantity: 2 },
      { product: 'sparklingWater', quantity: 2 },
    ],
    promotion: 'juiceDay',
    // Cancel after a settled charge: the refund closes the payment and the stock
    // deduction is compensated by a restoring IN, so the ledger nets to zero.
    payments: [{ method: 'CREDIT_CARD', status: 'REFUNDED', minutesAfter: 3 }],
  },
  {
    key: 'totem-guest-delivered-araguari',
    unit: 'araguari',
    channel: 'TOTEM',
    status: 'DELIVERED',
    daysAgo: 6,
    guestName: 'Renata F.',
    items: [
      { product: 'orangeJuice', quantity: 2 },
      { product: 'brigadeiro', quantity: 1 },
    ],
    promotion: 'juiceDay',
    payments: [{ method: 'DEBIT_CARD', status: 'APPROVED', minutesAfter: 2 }],
  },
  {
    key: 'counter-guest-delivered-araguari',
    unit: 'araguari',
    channel: 'COUNTER',
    status: 'DELIVERED',
    daysAgo: 4,
    attendant: 'diego',
    guestName: 'Paulo R.',
    items: [
      { product: 'grilledChicken', quantity: 2 },
      { product: 'fries', quantity: 1 },
      { product: 'espresso', quantity: 2 },
    ],
    promotion: 'juiceDay',
    payments: [{ method: 'CASH', status: 'APPROVED', minutesAfter: 5 }],
  },
  {
    key: 'pickup-daniel-delivered-araguari',
    unit: 'araguari',
    channel: 'PICKUP',
    status: 'DELIVERED',
    daysAgo: 12,
    attendant: 'diego',
    customer: 'daniel',
    // Placed before Juice Day opened: an eligible-looking order with no promotion row.
    items: [
      { product: 'chickenWrap', quantity: 1 },
      { product: 'coke', quantity: 2 },
    ],
    payments: [{ method: 'DEBIT_CARD', status: 'APPROVED', minutesAfter: 2 }],
  },
  {
    key: 'app-felipe-retry-delivered',
    unit: 'uberaba',
    channel: 'APP',
    status: 'DELIVERED',
    daysAgo: 5,
    customer: 'felipe',
    items: [
      { product: 'comboChicken', quantity: 1 },
      { product: 'coke', quantity: 2 },
    ],
    promotion: 'openingWeek',
    // Two attempts on one order: REFUSED frees the live slot, so the retry is allowed
    // by the partial unique index on (order_id) WHERE status IN (PENDING, PROCESSING, APPROVED).
    payments: [
      { method: 'CREDIT_CARD', status: 'REFUSED', minutesAfter: 2 },
      { method: 'CREDIT_CARD', status: 'APPROVED', minutesAfter: 9 },
    ],
  },
  {
    key: 'pickup-gabriela-ready',
    unit: 'uberaba',
    channel: 'PICKUP',
    status: 'READY',
    daysAgo: 0,
    attendant: 'tiago',
    customer: 'gabriela',
    items: [
      { product: 'acaiPremium', quantity: 1 },
      { product: 'pudim', quantity: 1 },
    ],
    payments: [{ method: 'VOUCHER', status: 'APPROVED', minutesAfter: 3 }],
  },
  {
    key: 'web-henrique-preparing',
    unit: 'uberaba',
    channel: 'WEB',
    status: 'PREPARING',
    daysAgo: 0,
    // No loyalty account behind this customer: the order must price and pay normally
    // and simply earn nothing.
    customer: 'henrique',
    items: [
      { product: 'grilledChicken', quantity: 1 },
      { product: 'water', quantity: 1 },
    ],
    payments: [{ method: 'PIX', status: 'PROCESSING', minutesAfter: 1 }],
  },
  {
    key: 'totem-guest-cancelled-uberaba',
    unit: 'uberaba',
    channel: 'TOTEM',
    status: 'CANCELLED',
    daysAgo: 8,
    guestName: 'Vitor L.',
    notes: 'Abandoned at the totem',
    items: [{ product: 'chickenWrap', quantity: 1 }],
    payments: [{ method: 'PIX', status: 'CANCELLED', minutesAfter: 20 }],
  },
  {
    key: 'totem-guest-delivered-patos',
    unit: 'patos',
    channel: 'TOTEM',
    status: 'DELIVERED',
    daysAgo: 3,
    guestName: 'Ana Beatriz',
    items: [
      { product: 'comboAcaiJuice', quantity: 2 },
      { product: 'coxinha', quantity: 1 },
    ],
    promotion: 'kioskEight',
    payments: [{ method: 'PIX', status: 'APPROVED', minutesAfter: 2 }],
  },
  {
    key: 'counter-guest-delivered-patos',
    unit: 'patos',
    channel: 'COUNTER',
    status: 'DELIVERED',
    daysAgo: 2,
    // Served by an attendant who has since been deactivated: history keeps the link.
    attendant: 'lucas',
    guestName: 'Sergio M.',
    items: [
      { product: 'acaiTradicional', quantity: 2 },
      { product: 'orangeJuice', quantity: 2 },
    ],
    payments: [{ method: 'CASH', status: 'APPROVED', minutesAfter: 4 }],
  },
  // Placed while the Ituiutaba unit was still open: a closed unit keeps its history.
  {
    key: 'totem-guest-delivered-ituiutaba',
    unit: 'ituiutaba',
    channel: 'TOTEM',
    status: 'DELIVERED',
    daysAgo: 60,
    guestName: 'Cliente Ituiutaba',
    items: [{ product: 'acaiTradicional', quantity: 1 }],
    payments: [{ method: 'CASH', status: 'APPROVED', minutesAfter: 1 }],
  },
];

interface PlannedItem {
  id: string;
  productKey: ProductKey;
  productId: string;
  productName: string;
  quantity: number;
  unitPriceCents: number;
  subtotalCents: number;
  notes: string | null;
}

interface PlannedPayment {
  id: string;
  method: PaymentMethod;
  status: PaymentStatus;
  amountCents: number;
  createdAt: Date;
  extTransactionId: string | null;
}

interface PlannedLoyalty {
  id: string;
  accountId: string;
  customer: CustomerKey;
  type: 'EARN' | 'REDEEM';
  points: number;
  description: string;
  createdAt: Date;
  expiresAt: Date | null;
}

interface PlannedStockMovement {
  id: string;
  unit: UnitKey;
  product: ProductKey;
  type: 'IN' | 'OUT';
  quantity: number;
  reason: string;
  actorId: string;
  createdAt: Date;
}

export interface PlannedOrder {
  id: string;
  key: string;
  unit: UnitKey;
  businessUnitId: string;
  customerId: string | null;
  customerName: string | null;
  attendantId: string | null;
  channel: OrderChannel;
  status: OrderStatus;
  createdAt: Date;
  updatedAt: Date;
  notes: string | null;
  totalCents: number;
  pointsRedeemed: number;
  /** Credited to the loyalty ledger on settlement. NOT the Order.pointsEarned column. */
  pointsCredited: number;
  items: PlannedItem[];
  promotion: { id: string; discountCents: number } | null;
  payments: PlannedPayment[];
  loyalty: PlannedLoyalty[];
  stockMovements: PlannedStockMovement[];
}

export interface OrderPlan {
  orders: PlannedOrder[];
  /** Net units consumed per `${unit}/${product}`, used to open inventory consistently. */
  netDeductions: Map<string, number>;
  /** Net points moved per customer by order activity. */
  pointDeltas: Map<CustomerKey, number>;
}

/**
 * Prices every seeded order the way CreateOrderUseCase would: line subtotals from the
 * unit's menu price, promotion discount from the promotion policy, loyalty parcel after
 * it, total = subtotal - (promo + loyalty). Nothing here is a hardcoded total, so a
 * spec change cannot silently leave the numbers inconsistent.
 */
export function buildOrderPlan(
  catalog: Catalog,
  people: People,
  promotions: Promotions,
  fallbackActorId: string,
): OrderPlan {
  const orders: PlannedOrder[] = [];
  const netDeductions = new Map<string, number>();
  const pointDeltas = new Map<CustomerKey, number>();

  const addPoints = (customer: CustomerKey, points: number): void => {
    pointDeltas.set(customer, (pointDeltas.get(customer) ?? 0) + points);
  };

  for (const spec of ORDERS) {
    assertIdentityMatchesChannel(spec);

    const createdAt = orderCreatedAt(spec);
    const orderId = seedId(`order:${spec.key}`);

    const items = spec.items.map((line, index) => {
      const unitPriceCents = catalog.priceOf(spec.unit, line.product);
      return {
        id: seedId(`order-item:${spec.key}:${index}`),
        productKey: line.product,
        productId: catalog.productIds[line.product],
        // Snapshot, exactly as the use case takes it: the name as it reads today.
        productName: catalog.productNames[line.product],
        quantity: line.quantity,
        unitPriceCents,
        subtotalCents: unitPriceCents * line.quantity,
        notes: line.notes ?? null,
      };
    });

    const itemsSubtotalCents = items.reduce((sum, item) => sum + item.subtotalCents, 0);

    // Selected, not declared. Promotion application is not opt-in: CreateOrderUseCase
    // quotes every active-in-window promotion of the unit and takes the best one, so an
    // order that skipped an eligible promotion is a row the API could not have written.
    // The spec's `promotion` field is only an assertion that we landed where it says.
    const winner = selectBestPromotion(
      promotions.forUnit(spec.unit),
      itemsSubtotalCents,
      createdAt,
    );
    if ((winner?.key ?? null) !== (spec.promotion ?? null)) {
      throw new Error(
        `Order ${spec.key} expects promotion ${spec.promotion ?? '(none)'} but the unit's ` +
          `promotions price ${winner?.key ?? '(none)'} as the best one at that moment.`,
      );
    }
    const promotion = winner ? { id: winner.id, discountCents: winner.discountCents } : null;

    const pointsRedeemed = spec.pointsRedeemed ?? 0;
    const loyaltyDiscountCents = redemptionValueCents(pointsRedeemed);
    const totalCents = itemsSubtotalCents - (promotion?.discountCents ?? 0) - loyaltyDiscountCents;
    if (totalCents < 0) {
      throw new Error(`Order ${spec.key} discounts more than its subtotal.`);
    }

    const payments: PlannedPayment[] = spec.payments.map((payment, index) => ({
      id: seedId(`payment:${spec.key}:${index}`),
      method: payment.method,
      status: payment.status,
      amountCents: totalCents,
      createdAt: new Date(createdAt.getTime() + payment.minutesAfter * 60 * 1000),
      // A gateway id only exists once the attempt reached the gateway.
      extTransactionId:
        payment.status === 'PENDING' ? null : `seed-tx-${spec.key}-${String(index + 1)}`,
    }));

    assertReservationsAreFresh(spec.key, payments);

    const settled = payments.find((payment) => payment.status === 'APPROVED');
    const loyaltyAccountId = spec.customer ? people.loyaltyAccountIds[spec.customer] : undefined;

    const loyalty: PlannedLoyalty[] = [];
    if (spec.customer && loyaltyAccountId && pointsRedeemed > 0) {
      loyalty.push({
        id: seedId(`loyalty-tx:${spec.key}:redeem`),
        accountId: loyaltyAccountId,
        customer: spec.customer,
        type: 'REDEEM',
        points: pointsRedeemed,
        description: `Redeemed ${String(pointsRedeemed)} points on order ${orderId}`,
        createdAt,
        expiresAt: null,
      });
      addPoints(spec.customer, -pointsRedeemed);
    }

    // Points are credited on payment approval, never at creation, and only while the
    // customer's LGPD consent stands. This lands in the loyalty ledger only: nothing in
    // the application writes Order.pointsEarned back, so that column stays 0 (see the
    // order write below).
    const consentStands = spec.customer ? people.loyaltyConsent[spec.customer] === true : false;
    const pointsCredited =
      settled && loyaltyAccountId && consentStands ? pointsEarnedFor(totalCents) : 0;
    if (spec.customer && loyaltyAccountId && pointsCredited > 0 && settled) {
      loyalty.push({
        id: seedId(`loyalty-tx:${spec.key}:earn`),
        accountId: loyaltyAccountId,
        customer: spec.customer,
        type: 'EARN',
        points: pointsCredited,
        description: `Earned ${String(pointsCredited)} points on order ${orderId}`,
        createdAt: settled.createdAt,
        expiresAt: twelveMonthsAfter(settled.createdAt),
      });
      addPoints(spec.customer, pointsCredited);
    }

    // Stock leaves at creation (RN-28), so every order deducts regardless of status;
    // a cancellation compensates with a restoring IN instead of erasing the OUT.
    const actorId =
      (spec.customer ? people.ids[spec.customer] : null) ??
      (spec.attendant ? people.ids[spec.attendant] : null) ??
      fallbackActorId;

    const stockMovements: PlannedStockMovement[] = items.map((item, index) => ({
      id: seedId(`inventory-tx:${spec.key}:out:${String(index)}`),
      unit: spec.unit,
      product: item.productKey,
      type: 'OUT' as const,
      quantity: item.quantity,
      reason: `Stock deducted for order ${orderId}`,
      actorId,
      createdAt,
    }));

    const cancelledAt = new Date(createdAt.getTime() + 30 * 60 * 1000);
    if (spec.status === 'CANCELLED') {
      stockMovements.push(
        ...items.map((item, index) => ({
          id: seedId(`inventory-tx:${spec.key}:in:${String(index)}`),
          unit: spec.unit,
          product: item.productKey,
          type: 'IN' as const,
          quantity: item.quantity,
          reason: `Stock restored for cancelled order ${orderId}`,
          actorId,
          createdAt: cancelledAt,
        })),
      );
    }

    for (const movement of stockMovements) {
      const stockKey = `${movement.unit}/${movement.product}`;
      const delta = movement.type === 'OUT' ? movement.quantity : -movement.quantity;
      netDeductions.set(stockKey, (netDeductions.get(stockKey) ?? 0) + delta);
    }

    const lastTouch = [
      ...payments.map((payment) => payment.createdAt),
      spec.status === 'CANCELLED' ? cancelledAt : createdAt,
    ].reduce((latest, current) => (current > latest ? current : latest), createdAt);

    orders.push({
      id: orderId,
      key: spec.key,
      unit: spec.unit,
      businessUnitId: catalog.unitIds[spec.unit],
      customerId: spec.customer ? people.ids[spec.customer] : null,
      customerName: spec.guestName ?? null,
      attendantId: spec.attendant ? people.ids[spec.attendant] : null,
      channel: spec.channel,
      status: spec.status,
      createdAt,
      updatedAt: lastTouch,
      notes: spec.notes ?? null,
      totalCents,
      pointsRedeemed,
      pointsCredited,
      items,
      promotion,
      payments,
      loyalty,
      stockMovements,
    });
  }

  return { orders, netDeductions, pointDeltas };
}

/** Payment reservations are dated this recently so the sweeper does not eat them at boot. */
const PENDING_PAYMENT_GRACE_MINUTES = 3;

/** Mirrors RESERVATION_TTL_MS in stale-payment.sweeper.ts (15 minutes). */
const RESERVATION_TTL_MINUTES = 15;

/**
 * When an order happened. Same-day orders are backdated 90 minutes so they read as
 * history rather than as "just now", except when they carry a PENDING payment: the
 * stale-payment sweeper cancels reservations older than RESERVATION_TTL_MS within five
 * minutes of the app booting, so a backdated reservation would be gone before anyone
 * could look at it, and re-seeding would not bring it back.
 */
function orderCreatedAt(spec: OrderSpec): Date {
  const holdsReservation = spec.payments.some((payment) => payment.status === 'PENDING');
  if (!holdsReservation) {
    return daysAgo(spec.daysAgo, spec.daysAgo === 0 ? -90 : 0);
  }

  if (spec.daysAgo !== 0) {
    throw new Error(
      `Order ${spec.key} holds a PENDING payment but is dated ${String(spec.daysAgo)} days back; ` +
        'the sweeper would cancel it immediately.',
    );
  }
  return daysAgo(0, -PENDING_PAYMENT_GRACE_MINUTES);
}

/** Fails the seed if a reservation is born already past the sweeper's TTL. */
function assertReservationsAreFresh(key: string, payments: PlannedPayment[]): void {
  for (const payment of payments) {
    if (payment.status !== 'PENDING') {
      continue;
    }
    const ageMinutes = (SEED_NOW.getTime() - payment.createdAt.getTime()) / 60_000;
    if (ageMinutes >= RESERVATION_TTL_MINUTES) {
      throw new Error(
        `Order ${key} writes a PENDING payment ${String(Math.round(ageMinutes))} minutes old; ` +
          `the sweeper cancels anything past ${String(RESERVATION_TTL_MINUTES)}.`,
      );
    }
  }
}

/**
 * The promotion CreateOrderUseCase would have picked for this order, mirroring
 * isEligible() and selectBest(): active, inside its half-open window, subtotal at or
 * above minOrderValue, largest positive discount, ties broken by the smallest id.
 */
function selectBestPromotion(
  candidates: ResolvedPromotion[],
  subtotalCents: number,
  at: Date,
): (ResolvedPromotion & { discountCents: number }) | null {
  let best: (ResolvedPromotion & { discountCents: number }) | null = null;

  for (const candidate of candidates) {
    if (!candidate.isActive) {
      continue;
    }
    if (
      at.getTime() < candidate.startDate.getTime() ||
      at.getTime() >= candidate.endDate.getTime()
    ) {
      continue;
    }
    if (subtotalCents < candidate.minOrderCents) {
      continue;
    }

    const discount = discountCents(candidate.discountType, subtotalCents, candidate.valueCents);
    if (discount <= 0) {
      continue;
    }
    if (
      best === null ||
      discount > best.discountCents ||
      (discount === best.discountCents && candidate.id < best.id)
    ) {
      best = { ...candidate, discountCents: discount };
    }
  }

  return best;
}

/**
 * Channel policy, enforced here so a bad spec fails loudly at seed time instead of
 * producing a row the API could never have created:
 * APP/WEB carry an account and no guest name, TOTEM carries a guest name and no
 * account, COUNTER/PICKUP need an attendant and exactly one of the two identities.
 */
function assertIdentityMatchesChannel(spec: OrderSpec): void {
  const hasCustomer = Boolean(spec.customer);
  const hasGuestName = Boolean(spec.guestName);

  if (hasCustomer && hasGuestName) {
    throw new Error(`Order ${spec.key} sets both a customer and a guest name.`);
  }

  switch (spec.channel) {
    case 'APP':
    case 'WEB':
      if (!hasCustomer || hasGuestName) {
        throw new Error(
          `Order ${spec.key}: ${spec.channel} orders need an account, no guest name.`,
        );
      }
      break;
    case 'TOTEM':
      if (hasCustomer || !hasGuestName) {
        throw new Error(`Order ${spec.key}: TOTEM orders are anonymous and need a guest name.`);
      }
      break;
    case 'COUNTER':
    case 'PICKUP':
      if (!spec.attendant) {
        throw new Error(`Order ${spec.key}: ${spec.channel} orders need an attendant.`);
      }
      if (!hasCustomer && !hasGuestName) {
        throw new Error(`Order ${spec.key}: ${spec.channel} orders need a customer or a name.`);
      }
      break;
  }
}

export async function writeOrders(
  prisma: PrismaClient,
  plan: OrderPlan,
  inventoryIdOf: (unit: UnitKey, product: ProductKey) => string,
): Promise<void> {
  for (const order of plan.orders) {
    await prisma.order.upsert({
      where: { id: order.id },
      update: {},
      create: {
        id: order.id,
        businessUnitId: order.businessUnitId,
        customerId: order.customerId,
        customerName: order.customerName,
        attendantId: order.attendantId,
        pointsRedeemed: order.pointsRedeemed,
        // Left at 0 on purpose. No application path writes this column: creation
        // documents it as staying at the default, and settlement credits points by
        // writing a LoyaltyTransaction instead. The earned points live in the loyalty
        // ledger (order.pointsCredited above), which is where the API puts them.
        pointsEarned: 0,
        totalAmount: toDecimalString(order.totalCents),
        notes: order.notes,
        orderChannel: order.channel,
        orderStatus: order.status,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      },
    });

    for (const item of order.items) {
      await prisma.orderItem.upsert({
        where: { id: item.id },
        update: {},
        create: {
          id: item.id,
          orderId: order.id,
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          unitPrice: toDecimalString(item.unitPriceCents),
          subtotal: toDecimalString(item.subtotalCents),
          notes: item.notes,
        },
      });
    }

    if (order.promotion) {
      await prisma.orderPromotion.upsert({
        where: { id: seedId(`order-promotion:${order.key}`) },
        update: {},
        create: {
          id: seedId(`order-promotion:${order.key}`),
          orderId: order.id,
          promotionId: order.promotion.id,
          discountApplied: toDecimalString(order.promotion.discountCents),
        },
      });
    }

    for (const payment of order.payments) {
      await prisma.payment.upsert({
        where: { id: payment.id },
        update: {},
        create: {
          id: payment.id,
          orderId: order.id,
          amount: toDecimalString(payment.amountCents),
          method: payment.method,
          status: payment.status,
          extTransactionId: payment.extTransactionId,
          gatewayRequest: { provider: 'mock', amount: toDecimalString(payment.amountCents) },
          gatewayResponse:
            payment.status === 'PENDING'
              ? undefined
              : {
                  provider: 'mock',
                  status: payment.status,
                  transactionId: payment.extTransactionId,
                },
          createdAt: payment.createdAt,
          updatedAt: payment.createdAt,
        },
      });
    }

    for (const movement of order.stockMovements) {
      await prisma.inventoryTransaction.upsert({
        where: { id: movement.id },
        update: {},
        create: {
          id: movement.id,
          inventoryId: inventoryIdOf(movement.unit, movement.product),
          orderId: order.id,
          createdBy: movement.actorId,
          type: movement.type,
          quantity: movement.quantity,
          reason: movement.reason,
          createdAt: movement.createdAt,
        },
      });
    }

    for (const entry of order.loyalty) {
      await prisma.loyaltyTransaction.upsert({
        where: { id: entry.id },
        update: {},
        create: {
          id: entry.id,
          loyaltyAccountId: entry.accountId,
          orderId: order.id,
          type: entry.type,
          points: entry.points,
          description: entry.description,
          createdAt: entry.createdAt,
          expiresAt: entry.expiresAt,
        },
      });
    }
  }
}

/** Order ids by spec key, for the modules that reference an order (audit, idempotency). */
export function orderIdOf(key: string): string {
  return seedId(`order:${key}`);
}
