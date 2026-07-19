import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from './utils/hash';

if (process.env.NODE_ENV === 'production') {
  throw new Error('Seed must not run in production.');
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main(): Promise<void> {
  // =======================================================
  // BUSINESS UNITS
  // =======================================================
  const unit1 = await prisma.businessUnit.upsert({
    where: { cnpj: '00.000.000/0001-00' },
    update: {},
    create: {
      id: 'e36e29da-52ae-49af-ab40-5f1e8b61c8a1', // uuid static for api tests
      name: 'Rainbow Flavors - Uberlândia',
      cnpj: '00.000.000/0001-00',
      address: 'Street X, 123',
      city: 'Uberlândia',
      phone: '34999999999',
      isActive: true,
    },
  });

  const unit2 = await prisma.businessUnit.upsert({
    where: { cnpj: '00.000.000/0002-00' },
    update: {},
    create: {
      id: 'f47e30eb-63bf-4db0-bf41-602f9c72d9b2', // uuid static for api tests
      name: 'Ark Drinks - Araguari',
      cnpj: '00.000.000/0002-00',
      address: 'Street Z, 987',
      city: 'Araguari',
      phone: '34999999998',
      isActive: true,
    },
  });

  // =======================================================
  // USERS
  // =======================================================

  const devPassword = await hashPassword('P@ssword10');

  await prisma.user.upsert({
    where: { username: 'pedro.panic' },
    update: {},
    create: {
      username: 'pedro.panic',
      name: 'Pedro Panic',
      email: 'pedro.panic@nexio.com',
      passwordHash: devPassword,
      role: 'KITCHEN',
      businessUnits: { create: [{ businessUnitId: unit1.id }] },
    },
  });

  const admin = await prisma.user.upsert({
    where: { username: 'nexio.admin' },
    update: {},
    create: {
      username: 'nexio.admin',
      name: 'Nexio Administrator',
      email: 'admin@nomail.com',
      passwordHash: devPassword,
      role: 'ADMIN',
      businessUnits: { create: [{ businessUnitId: unit2.id }] },
    },
  });

  await prisma.user.upsert({
    where: { username: 'gustavo.linhares' },
    update: {},
    create: {
      username: 'gustavo.linhares',
      name: 'Gustavo Linhares',
      email: 'gustavo.linhares@nexio.com',
      passwordHash: devPassword,
      role: 'MANAGER',
      businessUnits: { create: [{ businessUnitId: unit2.id }] },
    },
  });

  await prisma.user.upsert({
    where: { username: 'nexio.customer' },
    update: {},
    create: {
      username: 'nexio.customer',
      name: 'Nexio Customer',
      email: 'customer@nexio.com',
      passwordHash: devPassword,
      role: 'CUSTOMER',
    },
  });

  await prisma.user.upsert({
    where: { username: 'nexio.attendant' },
    update: {},
    create: {
      username: 'nexio.attendant',
      name: 'Nexio Attendant',
      email: 'attendant@nomail.com',
      passwordHash: devPassword,
      role: 'ATTENDANT',
    },
  });

  // =======================================================
  // CATEGORIES
  // =======================================================
  const acaiCategory = await prisma.category.upsert({
    where: { name: 'Açaí' },
    update: {},
    create: {
      name: 'Açaí',
      description: 'Açaí Category',
    },
  });

  const beverageCategory = await prisma.category.upsert({
    where: { name: 'Beverage' },
    update: {},
    create: {
      id: 'ab24d105-6abe-4cab-bf39-bffd8c8cdabd', // uuid static for api tests
      name: 'Beverage',
      description: 'Beverage Category',
    },
  });

  const chickenCategory = await prisma.category.upsert({
    where: { name: 'Chicken' },
    update: {},
    create: {
      name: 'Chicken',
      description: 'Chicken Category',
    },
  });

  // =======================================================
  // PRODUCTS
  // =======================================================
  const prod1 = await prisma.product.upsert({
    where: { name: 'Açaí Fitness' },
    update: {},
    create: {
      id: 'cebe6acf-e54e-4842-a8ec-eda9a439ceb5', // uuid static for api tests
      categoryId: acaiCategory.id,
      name: 'Açaí Fitness',
      basePrice: 20.5,
      imageUrl: '@example1.com',
    },
  });

  const prod2 = await prisma.product.upsert({
    where: { name: 'Lemon Juice' },
    update: {},
    create: {
      categoryId: beverageCategory.id,
      name: 'Lemon Juice',
      basePrice: 10,
      imageUrl: '@example2.com',
    },
  });

  const prod3 = await prisma.product.upsert({
    where: { name: 'Grape Juice' },
    update: {},
    create: {
      categoryId: beverageCategory.id,
      name: 'Grape Juice',
      basePrice: 9.7,
      imageUrl: '@example3.com',
    },
  });
  const prod4 = await prisma.product.upsert({
    where: { name: 'Chicken Stroganoff' },
    update: {},
    create: {
      categoryId: chickenCategory.id,
      name: 'Chicken Stroganoff',
      basePrice: 20,
      imageUrl: '@example4.com',
    },
  });

  // =======================================================
  // BUSINESS UNIT MENU ITEMS
  // =======================================================
  await prisma.businessUnitMenuItem.upsert({
    where: { businessUnitId_productId: { businessUnitId: unit1.id, productId: prod1.id } },
    update: {},
    create: {
      businessUnitId: unit1.id,
      productId: prod1.id,
      customPrice: 22.3,
      isAvailable: true,
    },
  });

  await prisma.businessUnitMenuItem.upsert({
    where: { businessUnitId_productId: { businessUnitId: unit1.id, productId: prod2.id } },
    update: {},
    create: {
      businessUnitId: unit1.id,
      productId: prod2.id,
      customPrice: 12.3,
      isAvailable: true,
    },
  });

  await prisma.businessUnitMenuItem.upsert({
    where: { businessUnitId_productId: { businessUnitId: unit2.id, productId: prod2.id } },
    update: {},
    create: {
      businessUnitId: unit2.id,
      productId: prod2.id,
      customPrice: 9.7,
      isAvailable: true,
    },
  });

  await prisma.businessUnitMenuItem.upsert({
    where: { businessUnitId_productId: { businessUnitId: unit2.id, productId: prod3.id } },
    update: {},
    create: {
      businessUnitId: unit2.id,
      productId: prod3.id,
      customPrice: 11.3,
      isAvailable: true,
    },
  });
  await prisma.businessUnitMenuItem.upsert({
    where: { businessUnitId_productId: { businessUnitId: unit2.id, productId: prod4.id } },
    update: {},
    create: {
      businessUnitId: unit2.id,
      productId: prod4.id,
      customPrice: 23.3,
      isAvailable: true,
    },
  });

  // =======================================================
  // INVENTORY
  // =======================================================
  // One stock row per menu item: order creation deducts stock (RN-28), so a
  // product without inventory at the unit cannot be ordered. Each row opens with
  // an IN ledger entry, so the InventoryTransaction history reconciles to the
  // stored balance instead of starting from a phantom 100 with no movement.
  const OPENING_QUANTITY = 100;
  const stocks: { businessUnitId: string; productId: string }[] = [
    { businessUnitId: unit1.id, productId: prod1.id },
    { businessUnitId: unit1.id, productId: prod2.id },
    { businessUnitId: unit2.id, productId: prod2.id },
    { businessUnitId: unit2.id, productId: prod3.id },
    { businessUnitId: unit2.id, productId: prod4.id },
  ];

  for (const stock of stocks) {
    // Find-or-create, not upsert: the opening ledger entry must land exactly once,
    // so a re-seed of an existing row never doubles the recorded movement.
    const existing = await prisma.inventory.findUnique({
      where: { businessUnitId_productId: stock },
    });
    if (existing) {
      continue;
    }

    const inventory = await prisma.inventory.create({
      data: { ...stock, quantity: OPENING_QUANTITY, minQuantity: 5 },
    });
    await prisma.inventoryTransaction.create({
      data: {
        inventoryId: inventory.id,
        createdBy: admin.id,
        type: 'IN',
        quantity: OPENING_QUANTITY,
        reason: 'Opening balance (seed)',
      },
    });
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
