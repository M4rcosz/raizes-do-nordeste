import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Prisma } from '@prisma/client';
import { Money } from '@shared/domain/value-objects/money';
import { PrismaOrderProductLookup } from './prisma-order-product-lookup';
import type { PrismaService } from '@shared/infrastructure/prisma/prisma.service';

type MenuItemRow = {
  productId: string;
  customPrice: Prisma.Decimal;
  isAvailable: boolean;
  product: { isActive: boolean; name: string };
};
type FindMany = (args: unknown) => Promise<MenuItemRow[]>;

describe('PrismaOrderProductLookup', () => {
  let menuItemFindMany: jest.MockedFunction<FindMany>;
  let lookup: PrismaOrderProductLookup;

  beforeEach(() => {
    menuItemFindMany = jest.fn() as jest.MockedFunction<FindMany>;

    const prisma = {
      businessUnitMenuItem: { findMany: menuItemFindMany },
    } as unknown as PrismaService;

    lookup = new PrismaOrderProductLookup(prisma);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns an empty map when no productIds are requested without hitting the database', async () => {
    const result = await lookup.resolve('bu-1', []);

    expect(result.size).toBe(0);
    expect(menuItemFindMany).not.toHaveBeenCalled();
  });

  it('resolves name and price from the product, active from the product, and availability from the menu item', async () => {
    menuItemFindMany.mockResolvedValue([
      {
        productId: 'p-1',
        customPrice: new Prisma.Decimal('9.99'),
        isAvailable: true,
        product: { isActive: true, name: 'Baiao de Dois' },
      },
    ]);

    const result = await lookup.resolve('bu-1', ['p-1']);

    expect(result.get('p-1')?.name).toBe('Baiao de Dois');
    expect(result.get('p-1')?.price.equals(Money.fromDecimalString('9.99'))).toBe(true);
    expect(result.get('p-1')?.isActive).toBe(true);
    expect(result.get('p-1')?.isAvailable).toBe(true);
  });

  it('propagates Product.isActive=false unchanged', async () => {
    menuItemFindMany.mockResolvedValue([
      {
        productId: 'p-1',
        customPrice: new Prisma.Decimal('9.99'),
        isAvailable: true,
        product: { isActive: false, name: 'Baiao de Dois' },
      },
    ]);

    const result = await lookup.resolve('bu-1', ['p-1']);

    expect(result.get('p-1')?.isActive).toBe(false);
  });

  it('propagates isAvailable=false so callers can reject unavailable menu items', async () => {
    menuItemFindMany.mockResolvedValue([
      {
        productId: 'p-1',
        customPrice: new Prisma.Decimal('9.99'),
        isAvailable: false,
        product: { isActive: true, name: 'Baiao de Dois' },
      },
    ]);

    const result = await lookup.resolve('bu-1', ['p-1']);

    expect(result.get('p-1')?.isAvailable).toBe(false);
  });

  it('omits products that are not on this business unit menu', async () => {
    menuItemFindMany.mockResolvedValue([
      {
        productId: 'p-1',
        customPrice: new Prisma.Decimal('9.99'),
        isAvailable: true,
        product: { isActive: true, name: 'Baiao de Dois' },
      },
    ]);

    const result = await lookup.resolve('bu-1', ['p-1', 'p-not-on-menu']);

    expect(result.has('p-not-on-menu')).toBe(false);
    expect(result.get('p-1')?.price.equals(Money.fromDecimalString('9.99'))).toBe(true);
  });

  it('scopes the menu lookup to the requested business unit and products', async () => {
    menuItemFindMany.mockResolvedValue([]);

    await lookup.resolve('bu-1', ['p-1', 'p-2']);

    expect(menuItemFindMany).toHaveBeenCalledWith({
      where: { businessUnitId: 'bu-1', productId: { in: ['p-1', 'p-2'] } },
      select: {
        productId: true,
        customPrice: true,
        isAvailable: true,
        product: { select: { isActive: true, name: true } },
      },
    });
  });

  it('reads through the provided transaction client instead of the base prisma service', async () => {
    const txFindMany = jest.fn() as jest.MockedFunction<FindMany>;
    txFindMany.mockResolvedValue([]);
    const tx = { businessUnitMenuItem: { findMany: txFindMany } };

    await lookup.resolve('bu-1', ['p-1'], tx);

    expect(txFindMany).toHaveBeenCalledTimes(1);
    expect(menuItemFindMany).not.toHaveBeenCalled();
  });
});
