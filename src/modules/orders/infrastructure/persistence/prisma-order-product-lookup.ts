import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/infrastructure/prisma/prisma.service';
import Big from 'big.js';
import { Prisma } from '@prisma/client';
import {
  OrderProductLookup,
  ResolvedProduct,
} from '@modules/orders/application/ports/order-product-lookup.port';
import { TransactionContext } from '@shared/transaction/transaction-runner.port';

@Injectable()
export class PrismaOrderProductLookup implements OrderProductLookup {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(
    businessUnitId: string,
    productIds: string[],
    tx?: TransactionContext,
  ): Promise<Map<string, ResolvedProduct>> {
    if (productIds.length === 0) {
      return new Map();
    }

    const db = (tx as Prisma.TransactionClient) ?? this.prisma;

    const menuItems = await db.businessUnitMenuItem.findMany({
      where: { businessUnitId, productId: { in: productIds } },
      select: {
        productId: true,
        customPrice: true,
        isAvailable: true,
        product: { select: { isActive: true } },
      },
    });

    const resolved = new Map<string, ResolvedProduct>();
    for (const menuItem of menuItems) {
      resolved.set(menuItem.productId, {
        price: new Big(menuItem.customPrice.toString()),
        isActive: menuItem.product.isActive,
        isAvailable: menuItem.isAvailable,
      });
    }
    return resolved;
  }
}
