import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/infrastructure/prisma/prisma.service';
import { Money } from '@shared/domain/value-objects/money';
import { InvalidMoneyError } from '@shared/errors/domain/invalid-money.error';
import { CorruptPersistedMoneyError } from '@shared/errors/infrastructure/corrupt-persisted-money.error';
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
        price: this.toMoney(menuItem.customPrice),
        isActive: menuItem.product.isActive,
        isAvailable: menuItem.isAvailable,
      });
    }
    return resolved;
  }

  // Read-path Money parse. A persisted value big.js rejects means corrupt DB data
  // (server fault), so we rethrow as infra error -> HTTP 500 generic, raw value
  // stays in the cause for logs only, never echoed to the client.
  private toMoney(raw: { toString(): string }): Money {
    try {
      return Money.fromDecimalString(raw.toString());
    } catch (err) {
      if (err instanceof InvalidMoneyError) {
        throw new CorruptPersistedMoneyError({ cause: err });
      }
      throw err;
    }
  }
}
