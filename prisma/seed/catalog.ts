import { PrismaClient } from '@prisma/client';
import { seedId } from './ids';
import { toDecimalString } from './money';

// Keys used across the seed modules to refer to a unit/category/product without
// carrying uuids around. unit1/unit2 are the two units the base seed already creates;
// they are referenced, never rewritten.
export type UnitKey = 'uberlandia' | 'araguari' | 'uberaba' | 'patos' | 'ituiutaba';
export type CategoryKey =
  | 'acai'
  | 'beverage'
  | 'chicken'
  | 'snack'
  | 'dessert'
  | 'combo'
  | 'coffee'
  | 'seasonal';
export type ProductKey =
  | 'acaiTradicional'
  | 'acaiPremium'
  | 'acaiZero'
  | 'orangeJuice'
  | 'passionJuice'
  | 'sparklingWater'
  | 'coke'
  | 'water'
  | 'grilledChicken'
  | 'chickenWrap'
  | 'caesarSalad'
  | 'coxinha'
  | 'pastel'
  | 'fries'
  | 'brigadeiro'
  | 'pudim'
  | 'comboAcaiJuice'
  | 'comboChicken'
  | 'espresso'
  | 'cappuccino'
  | 'hotChocolate';

/** A menu line: which product a unit sells, at what price, and whether it is orderable. */
export interface MenuEntry {
  unit: UnitKey;
  product: ProductKey;
  priceCents: number;
  isAvailable?: boolean;
  /** Opening stock. Absent means the product is on the menu with no inventory row. */
  openingStock?: number;
  minQuantity?: number;
}

export interface Catalog {
  unitIds: Record<UnitKey, string>;
  productIds: Record<ProductKey, string>;
  productNames: Record<ProductKey, string>;
  menu: MenuEntry[];
  /** Menu price lookup by `${unit}/${product}`, so order lines never re-derive it. */
  priceOf(unit: UnitKey, product: ProductKey): number;
}

interface ExistingRefs {
  unit1Id: string;
  unit2Id: string;
}

const NEW_UNITS: {
  key: Exclude<UnitKey, 'uberlandia' | 'araguari'>;
  name: string;
  cnpj: string;
  address: string;
  city: string;
  phone: string;
  isActive: boolean;
}[] = [
  {
    key: 'uberaba',
    name: 'Rainbow Flavors - Uberaba',
    cnpj: '00.000.000/0003-00',
    address: 'Avenida Leopoldino de Oliveira, 1450',
    city: 'Uberaba',
    phone: '34999999997',
    isActive: true,
  },
  {
    key: 'patos',
    name: 'Ark Drinks - Patos de Minas',
    cnpj: '00.000.000/0004-00',
    address: 'Rua Major Gote, 320',
    city: 'Patos de Minas',
    phone: '34999999996',
    isActive: true,
  },
  // Closed unit: the public listing filters on isActive, so this one must never show
  // up there while still being visible on the internal (ADMIN/MANAGER) listing.
  {
    key: 'ituiutaba',
    name: 'Rainbow Flavors - Ituiutaba',
    cnpj: '00.000.000/0005-00',
    address: 'Rua Vinte, 88',
    city: 'Ituiutaba',
    phone: '34999999995',
    isActive: false,
  },
];

const NEW_CATEGORIES: {
  key: Exclude<CategoryKey, 'acai' | 'beverage' | 'chicken'>;
  name: string;
  description: string;
  isActive: boolean;
}[] = [
  { key: 'snack', name: 'Snack', description: 'Snack Category', isActive: true },
  { key: 'dessert', name: 'Dessert', description: 'Dessert Category', isActive: true },
  { key: 'combo', name: 'Combo', description: 'Combo Category', isActive: true },
  { key: 'coffee', name: 'Coffee', description: 'Coffee Category', isActive: true },
  // Deactivated category: exercises the isActive filter on the category listing.
  { key: 'seasonal', name: 'Seasonal', description: 'Seasonal Category', isActive: false },
];

const PRODUCTS: {
  key: ProductKey;
  category: CategoryKey;
  name: string;
  description: string;
  basePriceCents: number;
  isActive?: boolean;
}[] = [
  {
    key: 'acaiTradicional',
    category: 'acai',
    name: 'Açaí Tradicional 300ml',
    description: 'Açaí with banana and granola',
    basePriceCents: 1800,
  },
  {
    key: 'acaiPremium',
    category: 'acai',
    name: 'Açaí Premium 500ml',
    description: 'Açaí with strawberry, condensed milk and nuts',
    basePriceCents: 2790,
  },
  {
    key: 'acaiZero',
    category: 'acai',
    name: 'Açaí Zero 300ml',
    description: 'No added sugar',
    basePriceCents: 2150,
  },
  {
    key: 'orangeJuice',
    category: 'beverage',
    name: 'Orange Juice',
    description: 'Freshly squeezed, 400ml',
    basePriceCents: 1100,
  },
  {
    key: 'passionJuice',
    category: 'beverage',
    name: 'Passion Fruit Juice',
    description: 'Freshly squeezed, 400ml',
    basePriceCents: 1250,
  },
  {
    key: 'sparklingWater',
    category: 'beverage',
    name: 'Sparkling Water 500ml',
    description: 'Chilled',
    basePriceCents: 600,
  },
  {
    key: 'coke',
    category: 'beverage',
    name: 'Coke 350ml',
    description: 'Canned',
    basePriceCents: 750,
  },
  {
    key: 'water',
    category: 'beverage',
    name: 'Mineral Water 500ml',
    description: 'Still',
    basePriceCents: 500,
  },
  {
    key: 'grilledChicken',
    category: 'chicken',
    name: 'Grilled Chicken Plate',
    description: 'Grilled breast, rice, beans and salad',
    basePriceCents: 3200,
  },
  {
    key: 'chickenWrap',
    category: 'chicken',
    name: 'Chicken Wrap',
    description: 'Shredded chicken, cheese and greens',
    basePriceCents: 2450,
  },
  {
    key: 'caesarSalad',
    category: 'chicken',
    name: 'Chicken Caesar Salad',
    description: 'Romaine, croutons and caesar dressing',
    basePriceCents: 2800,
  },
  {
    key: 'coxinha',
    category: 'snack',
    name: 'Cheese Coxinha',
    description: 'Fried chicken and cheese croquette',
    basePriceCents: 900,
  },
  {
    key: 'pastel',
    category: 'snack',
    name: 'Beef Pastel',
    description: 'Fried pastry with ground beef',
    basePriceCents: 1200,
  },
  {
    key: 'fries',
    category: 'snack',
    name: 'French Fries',
    description: 'Large portion',
    basePriceCents: 1600,
  },
  {
    key: 'brigadeiro',
    category: 'dessert',
    name: 'Brigadeiro Cup',
    description: 'Chocolate fudge cup',
    basePriceCents: 850,
  },
  {
    key: 'pudim',
    category: 'dessert',
    name: 'Pudim',
    description: 'Condensed milk flan',
    basePriceCents: 1100,
  },
  {
    key: 'comboAcaiJuice',
    category: 'combo',
    name: 'Combo Açaí + Juice',
    description: 'Açaí 300ml with a 400ml juice',
    basePriceCents: 2800,
  },
  {
    key: 'comboChicken',
    category: 'combo',
    name: 'Combo Chicken + Fries + Coke',
    description: 'Grilled chicken plate with fries and a canned drink',
    basePriceCents: 4500,
  },
  {
    key: 'espresso',
    category: 'coffee',
    name: 'Espresso',
    description: 'Single shot',
    basePriceCents: 650,
  },
  {
    key: 'cappuccino',
    category: 'coffee',
    name: 'Cappuccino',
    description: 'Espresso with steamed milk',
    basePriceCents: 1200,
  },
  // Retired product: sits in the deactivated category and is on no menu, so the
  // active-only product listing must skip it.
  {
    key: 'hotChocolate',
    category: 'seasonal',
    name: 'Winter Hot Chocolate',
    description: 'Seasonal, off the menu outside winter',
    basePriceCents: 1400,
    isActive: false,
  },
];

// Per-unit menus. Prices differ from basePrice on purpose: customPrice is what the
// order lines must charge, so a seed that mirrored basePrice everywhere would hide
// a bug that reads the wrong column.
const MENU: MenuEntry[] = [
  // Uberlandia (unit1): açaí house, full dessert and coffee line.
  { unit: 'uberlandia', product: 'acaiTradicional', priceCents: 1900, openingStock: 140 },
  { unit: 'uberlandia', product: 'acaiPremium', priceCents: 2890, openingStock: 90 },
  { unit: 'uberlandia', product: 'acaiZero', priceCents: 2250, openingStock: 60 },
  { unit: 'uberlandia', product: 'orangeJuice', priceCents: 1200, openingStock: 120 },
  { unit: 'uberlandia', product: 'passionJuice', priceCents: 1350, openingStock: 110 },
  { unit: 'uberlandia', product: 'water', priceCents: 500, openingStock: 200 },
  { unit: 'uberlandia', product: 'coxinha', priceCents: 950, openingStock: 80 },
  { unit: 'uberlandia', product: 'brigadeiro', priceCents: 900, openingStock: 70 },
  // Below minQuantity on purpose: the low-stock branch of the deduction result.
  { unit: 'uberlandia', product: 'pudim', priceCents: 1150, openingStock: 3, minQuantity: 5 },
  { unit: 'uberlandia', product: 'espresso', priceCents: 700, openingStock: 150 },
  { unit: 'uberlandia', product: 'cappuccino', priceCents: 1250, openingStock: 130 },
  { unit: 'uberlandia', product: 'comboAcaiJuice', priceCents: 2950, openingStock: 50 },
  { unit: 'uberlandia', product: 'fries', priceCents: 1700, openingStock: 95 },

  // Araguari (unit2): drinks house with a chicken line.
  { unit: 'araguari', product: 'orangeJuice', priceCents: 1100, openingStock: 130 },
  { unit: 'araguari', product: 'passionJuice', priceCents: 1250, openingStock: 100 },
  { unit: 'araguari', product: 'sparklingWater', priceCents: 650, openingStock: 160 },
  { unit: 'araguari', product: 'coke', priceCents: 800, openingStock: 180 },
  { unit: 'araguari', product: 'espresso', priceCents: 650, openingStock: 140 },
  { unit: 'araguari', product: 'cappuccino', priceCents: 1200, openingStock: 120 },
  { unit: 'araguari', product: 'grilledChicken', priceCents: 3300, openingStock: 60 },
  { unit: 'araguari', product: 'chickenWrap', priceCents: 2550, openingStock: 75 },
  { unit: 'araguari', product: 'fries', priceCents: 1650, openingStock: 110 },
  { unit: 'araguari', product: 'coxinha', priceCents: 900, openingStock: 4, minQuantity: 5 },
  { unit: 'araguari', product: 'brigadeiro', priceCents: 850, openingStock: 65 },

  // Uberaba (unit3): newest unit, broad menu.
  { unit: 'uberaba', product: 'acaiTradicional', priceCents: 1850, openingStock: 100 },
  { unit: 'uberaba', product: 'acaiPremium', priceCents: 2790, openingStock: 70 },
  { unit: 'uberaba', product: 'grilledChicken', priceCents: 3200, openingStock: 55 },
  { unit: 'uberaba', product: 'chickenWrap', priceCents: 2450, openingStock: 80 },
  // On the menu but switched off: the public menu must hide it, management must not.
  {
    unit: 'uberaba',
    product: 'caesarSalad',
    priceCents: 2800,
    isAvailable: false,
    openingStock: 20,
  },
  { unit: 'uberaba', product: 'fries', priceCents: 1600, openingStock: 120 },
  { unit: 'uberaba', product: 'coke', priceCents: 750, openingStock: 170 },
  { unit: 'uberaba', product: 'water', priceCents: 500, openingStock: 190 },
  { unit: 'uberaba', product: 'comboChicken', priceCents: 4590, openingStock: 45 },
  { unit: 'uberaba', product: 'pudim', priceCents: 1100, openingStock: 60 },
  { unit: 'uberaba', product: 'espresso', priceCents: 600, openingStock: 145 },

  // Patos de Minas (unit4): small kiosk menu.
  { unit: 'patos', product: 'acaiTradicional', priceCents: 1800, openingStock: 85 },
  { unit: 'patos', product: 'orangeJuice', priceCents: 1050, openingStock: 90 },
  { unit: 'patos', product: 'coxinha', priceCents: 850, openingStock: 75 },
  { unit: 'patos', product: 'pastel', priceCents: 1200, isAvailable: false, openingStock: 40 },
  // Available on the menu but out of stock: ordering it must fail on the stock guard,
  // not on the menu lookup.
  { unit: 'patos', product: 'coke', priceCents: 700, openingStock: 0 },
  { unit: 'patos', product: 'comboAcaiJuice', priceCents: 2800, openingStock: 35 },

  // Ituiutaba (unit5): closed unit that still carries data.
  { unit: 'ituiutaba', product: 'acaiTradicional', priceCents: 1900, openingStock: 25 },
  { unit: 'ituiutaba', product: 'orangeJuice', priceCents: 1100, openingStock: 30 },
];

export async function seedCatalog(prisma: PrismaClient, existing: ExistingRefs): Promise<Catalog> {
  const unitIds = {
    uberlandia: existing.unit1Id,
    araguari: existing.unit2Id,
  } as Record<UnitKey, string>;

  for (const unit of NEW_UNITS) {
    const created = await prisma.businessUnit.upsert({
      where: { cnpj: unit.cnpj },
      update: {},
      create: {
        id: seedId(`business-unit:${unit.key}`),
        name: unit.name,
        cnpj: unit.cnpj,
        address: unit.address,
        city: unit.city,
        phone: unit.phone,
        isActive: unit.isActive,
      },
    });
    unitIds[unit.key] = created.id;
  }

  const categoryIds = {} as Record<CategoryKey, string>;
  for (const key of ['acai', 'beverage', 'chicken'] as const) {
    const name = { acai: 'Açaí', beverage: 'Beverage', chicken: 'Chicken' }[key];
    const found = await prisma.category.findUniqueOrThrow({ where: { name } });
    categoryIds[key] = found.id;
  }

  for (const category of NEW_CATEGORIES) {
    const created = await prisma.category.upsert({
      where: { name: category.name },
      update: {},
      create: {
        id: seedId(`category:${category.key}`),
        name: category.name,
        description: category.description,
        isActive: category.isActive,
      },
    });
    categoryIds[category.key] = created.id;
  }

  const productIds = {} as Record<ProductKey, string>;
  const productNames = {} as Record<ProductKey, string>;
  for (const product of PRODUCTS) {
    const created = await prisma.product.upsert({
      where: { name: product.name },
      update: {},
      create: {
        id: seedId(`product:${product.key}`),
        categoryId: categoryIds[product.category],
        name: product.name,
        description: product.description,
        basePrice: toDecimalString(product.basePriceCents),
        imageUrl: `https://cdn.example.com/products/${product.key}.jpg`,
        isActive: product.isActive ?? true,
      },
    });
    productIds[product.key] = created.id;
    productNames[product.key] = created.name;
  }

  for (const entry of MENU) {
    await prisma.businessUnitMenuItem.upsert({
      where: {
        businessUnitId_productId: {
          businessUnitId: unitIds[entry.unit],
          productId: productIds[entry.product],
        },
      },
      update: {},
      create: {
        id: seedId(`menu-item:${entry.unit}:${entry.product}`),
        businessUnitId: unitIds[entry.unit],
        productId: productIds[entry.product],
        customPrice: toDecimalString(entry.priceCents),
        isAvailable: entry.isAvailable ?? true,
      },
    });
  }

  const priceIndex = new Map(MENU.map((entry) => [`${entry.unit}/${entry.product}`, entry]));

  return {
    unitIds,
    productIds,
    productNames,
    menu: MENU,
    priceOf(unit: UnitKey, product: ProductKey): number {
      const entry = priceIndex.get(`${unit}/${product}`);
      if (!entry) {
        throw new Error(`Seed order references ${product} which is not on the ${unit} menu.`);
      }
      return entry.priceCents;
    },
  };
}
