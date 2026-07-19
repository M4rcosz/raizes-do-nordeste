import { Injectable } from '@nestjs/common';
// Prisma's own Role enum, not identity's UserRole VO: orders must not import
// another context's domain, and this is a raw schema-level read anyway.
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '@shared/infrastructure/prisma/prisma.service';
import { TransactionContext } from '@shared/transaction/transaction-runner.port';
import { OrderCustomerLookup } from '@modules/orders/application/ports/order-customer-lookup.port';

/**
 * Reads the user table directly from orders, mirroring PrismaOrderProductLookup.
 * Keeping the impl inside the consuming module avoids importing IdentityModule just
 * for one existence check, and the port keeps the use case free of Prisma.
 */
@Injectable()
export class PrismaOrderCustomerLookup implements OrderCustomerLookup {
  constructor(private readonly prisma: PrismaService) {}

  async isBindableCustomer(customerId: string, tx?: TransactionContext): Promise<boolean> {
    const db = (tx as Prisma.TransactionClient) ?? this.prisma;

    // role and isActive are query terms, not a post-filter: a staff or deactivated
    // account comes back as a plain miss, with no row for the caller to inspect.
    const match = await db.user.findFirst({
      where: { id: customerId, role: Role.CUSTOMER, isActive: true },
      select: { id: true },
    });
    return match !== null;
  }
}
