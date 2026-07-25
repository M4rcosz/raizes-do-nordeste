import { PrismaClient } from '@prisma/client';
import { seedId } from './ids';
import { daysAgo, daysAhead } from './clock';
import { toDecimalString } from './money';
import type { Catalog, UnitKey } from './catalog';

export type PromotionKey =
  | 'comboWeek'
  | 'fiveOffForty'
  | 'blackFriday'
  | 'juiceDay'
  | 'winterPreview'
  | 'retiredFixed'
  | 'openingWeek'
  | 'kioskEight';

export interface PromotionSpec {
  key: PromotionKey;
  unit: UnitKey;
  name: string;
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT';
  /** Percent points for PERCENTAGE ("10.00" = 10%), cents for FIXED_AMOUNT. */
  valueCents: number;
  minOrderCents: number;
  startsDaysAgo: number;
  endsInDays: number;
  isActive: boolean;
}

/** A spec with its window resolved to instants, which is what the selection needs. */
export interface ResolvedPromotion extends PromotionSpec {
  id: string;
  startDate: Date;
  endDate: Date;
}

export interface Promotions {
  ids: Record<PromotionKey, string>;
  specOf(key: PromotionKey): PromotionSpec;
  /** Every promotion a unit carries, in whatever state, for the order planner to select from. */
  forUnit(unit: UnitKey): ResolvedPromotion[];
}

// A promotion is only applied by the pricing path when it is active AND inside its
// window AND the order clears minOrderValue, so the seed carries one row per way of
// failing that test plus the ones that pass.
const PROMOTIONS: PromotionSpec[] = [
  {
    key: 'comboWeek',
    unit: 'uberlandia',
    name: 'Combo Week 10%',
    discountType: 'PERCENTAGE',
    valueCents: 1000,
    minOrderCents: 5000,
    startsDaysAgo: 30,
    endsInDays: 30,
    isActive: true,
  },
  {
    key: 'fiveOffForty',
    unit: 'uberlandia',
    name: 'R$5 off above R$40',
    discountType: 'FIXED_AMOUNT',
    valueCents: 500,
    minOrderCents: 4000,
    startsDaysAgo: 15,
    endsInDays: 45,
    isActive: true,
  },
  // Active flag on, window already closed: must not price, must still be listable.
  {
    key: 'blackFriday',
    unit: 'uberlandia',
    name: 'Black Friday 25%',
    discountType: 'PERCENTAGE',
    valueCents: 2500,
    minOrderCents: 8000,
    startsDaysAgo: 120,
    endsInDays: -90,
    isActive: true,
  },
  {
    key: 'juiceDay',
    unit: 'araguari',
    name: 'Juice Day 15%',
    discountType: 'PERCENTAGE',
    valueCents: 1500,
    minOrderCents: 3000,
    startsDaysAgo: 10,
    endsInDays: 20,
    isActive: true,
  },
  // Window has not opened yet.
  {
    key: 'winterPreview',
    unit: 'araguari',
    name: 'Winter Preview 12%',
    discountType: 'PERCENTAGE',
    valueCents: 1200,
    minOrderCents: 4000,
    startsDaysAgo: -10,
    endsInDays: 40,
    isActive: true,
  },
  // In window but switched off.
  {
    key: 'retiredFixed',
    unit: 'araguari',
    name: 'Retired R$3 off',
    discountType: 'FIXED_AMOUNT',
    valueCents: 300,
    minOrderCents: 2000,
    startsDaysAgo: 20,
    endsInDays: 20,
    isActive: false,
  },
  {
    key: 'openingWeek',
    unit: 'uberaba',
    name: 'Opening Week 20%',
    discountType: 'PERCENTAGE',
    valueCents: 2000,
    minOrderCents: 6000,
    startsDaysAgo: 7,
    endsInDays: 14,
    isActive: true,
  },
  {
    key: 'kioskEight',
    unit: 'patos',
    name: 'Kiosk R$8 off above R$60',
    discountType: 'FIXED_AMOUNT',
    valueCents: 800,
    minOrderCents: 6000,
    startsDaysAgo: 5,
    endsInDays: 25,
    isActive: true,
  },
];

export async function seedPromotions(prisma: PrismaClient, catalog: Catalog): Promise<Promotions> {
  const ids = {} as Record<PromotionKey, string>;

  for (const promotion of PROMOTIONS) {
    const created = await prisma.promotion.upsert({
      where: { id: seedId(`promotion:${promotion.key}`) },
      update: {},
      create: {
        id: seedId(`promotion:${promotion.key}`),
        businessUnitId: catalog.unitIds[promotion.unit],
        name: promotion.name,
        discountType: promotion.discountType,
        discountValue: toDecimalString(promotion.valueCents),
        minOrderValue: toDecimalString(promotion.minOrderCents),
        startDate: daysAgo(promotion.startsDaysAgo),
        endDate: daysAhead(promotion.endsInDays),
        isActive: promotion.isActive,
      },
    });
    ids[promotion.key] = created.id;
  }

  const byKey = new Map(PROMOTIONS.map((promotion) => [promotion.key, promotion]));
  const resolved: ResolvedPromotion[] = PROMOTIONS.map((promotion) => ({
    ...promotion,
    id: ids[promotion.key],
    startDate: daysAgo(promotion.startsDaysAgo),
    endDate: daysAhead(promotion.endsInDays),
  }));

  return {
    ids,
    specOf(key: PromotionKey): PromotionSpec {
      const spec = byKey.get(key);
      if (!spec) {
        throw new Error(`Unknown seed promotion ${key}.`);
      }
      return spec;
    },
    forUnit(unit: UnitKey): ResolvedPromotion[] {
      return resolved.filter((promotion) => promotion.unit === unit);
    },
  };
}
