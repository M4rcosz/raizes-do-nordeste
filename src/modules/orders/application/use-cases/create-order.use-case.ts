import { OrderItem } from '@modules/orders/domain/entities/order-item.entity';
import { Order } from '@modules/orders/domain/entities/order.entity';
import {
  ORDER_REPOSITORY,
  type OrderRepository,
} from '@modules/orders/domain/repositories/order.repository';
import {
  channelCustomerSource,
  channelRequiresAttendant,
  OrderChannel,
} from '@modules/orders/domain/value-objects/order-channel';
import { Inject, Injectable } from '@nestjs/common';
import Big from 'big.js';
import { AttendantRequiredError } from '../errors/attendant-required.error';
import { PriceMismatchError } from '../errors/price-mismatch.error';
import { ProductInactiveError } from '../errors/product-inactive.error';
import { ProductUnavailableError } from '../errors/product-unavailable.error';
import { OrderReferenceNotFoundError } from '@modules/orders/domain/errors/order-reference-not-found.error';
import { ORDER_PRODUCT_LOOKUP, type OrderProductLookup } from '../ports/order-product-lookup.port';
import {
  TRANSACTION_RUNNER,
  type TransactionContext,
  type TransactionRunner,
} from '@shared/transaction/transaction-runner.port';
import { AUDIT_LOGGER, type AuditLogger } from '@modules/audit/application/ports/audit-logger.port';
import { AUDIT_ACTIONS } from '@modules/audit/domain/audit-actions';

/** Who is performing the operation, resolved from the auth token by the HTTP layer. */
export interface Actor {
  id: string;
  /**
   * Whether the actor may be recorded as the attendant on attendant-only channels
   * (COUNTER/PICKUP). The HTTP layer derives this from the user's role; the use case
   * stays free of the identity role taxonomy.
   */
  canAttend: boolean;
}

export interface CreateOrderCommand {
  businessUnitId: string;
  customerId?: string;
  pointsRedeemed?: number;
  notes?: string;
  orderChannel: OrderChannel;
  orderItems: {
    productId: string;
    quantity: number;
    unitPrice: string;
    notes?: string;
  }[];
}

@Injectable()
export class CreateOrderUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly orders: OrderRepository,
    @Inject(ORDER_PRODUCT_LOOKUP)
    private readonly productLookup: OrderProductLookup,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_LOGGER)
    private readonly audit: AuditLogger,
  ) {}

  async execute(command: CreateOrderCommand, actor: Actor): Promise<Order> {
    const {
      businessUnitId,
      orderChannel,
      notes,
      pointsRedeemed,
      orderItems: rawOrderItems,
    } = command;

    const { attendantId, customerId } = this.resolveParties(command, actor);

    // Validate and insert in one transaction, so the menu/product state can't change
    // between the read and the order insert.
    const order = await this.transactions.run(async (tx) => {
      await this.assertOrderableProducts(command, tx);

      const orderItems = rawOrderItems.map((item) => ({
        ...item,
        subtotal: OrderItem.calculateSubtotal(item.quantity, item.unitPrice).toString(),
      }));

      const itemsSubtotal = Order.calculateItemsSubtotal(orderItems.map((item) => item.subtotal));

      // TODO(loyalty): when the loyalty module ships, derive this discount from
      // pointsRedeemed (points -> money at the loyalty rate) instead of 0. The discount
      // rule (total = subtotal - discount) already lives in Order.computeTotal.
      const discountAmount = new Big(0);
      const totalAmount = Order.computeTotal(itemsSubtotal, discountAmount).toString();

      // TODO(loyalty): also set pointsEarned = floor(totalAmount) only when the customer
      // has a LoyaltyAccount with consent. For now it stays at the DB default (0).

      return this.orders.create(
        {
          businessUnitId,
          orderChannel,
          notes,
          pointsRedeemed,
          customerId,
          attendantId,
          orderItems,
          totalAmount,
        },
        tx,
      );
    });

    // Best-effort audit after the order is committed; failures here never roll it back.
    await this.audit.log({
      userId: actor.id,
      action: AUDIT_ACTIONS.ORDER_CREATED,
      entity: 'Order',
      entityId: order.id,
      metadata: { orderChannel, totalAmount: order.totalAmount.toFixed(2) },
    });

    return order;
  }

  /**
   * Rejects orders that reference a product not on this unit's menu (404), a product
   * that is inactive brand-wide (422), a menu item currently unavailable (422), or a
   * unitPrice that diverges from the authoritative price (422). Authoritative price is
   * BusinessUnitMenuItem.customPrice - only menu items are orderable.
   */
  private async assertOrderableProducts(
    command: CreateOrderCommand,
    tx: TransactionContext,
  ): Promise<void> {
    const productIds = command.orderItems.map((item) => item.productId);
    const authoritative = await this.productLookup.resolve(command.businessUnitId, productIds, tx);

    for (const item of command.orderItems) {
      const resolved = authoritative.get(item.productId);
      if (!resolved) {
        throw new OrderReferenceNotFoundError(
          `Product ${item.productId} is not on this business unit's menu.`,
        );
      }
      if (!resolved.isActive) {
        throw new ProductInactiveError(
          `Product ${item.productId} is inactive and cannot be ordered.`,
        );
      }
      if (!resolved.isAvailable) {
        throw new ProductUnavailableError(
          `Product ${item.productId} is currently unavailable at this business unit.`,
        );
      }
      if (!resolved.price.eq(new Big(item.unitPrice))) {
        throw new PriceMismatchError(
          `Unit price ${item.unitPrice} does not match the authoritative price ${resolved.price.toFixed(
            2,
          )} for product ${item.productId} at this business unit.`,
        );
      }
    }
  }

  /** Decides who the customer/attendant are based on the channel policy and the actor. */
  private resolveParties(
    command: CreateOrderCommand,
    actor: Actor,
  ): { attendantId: string | null; customerId: string | null } {
    if (channelRequiresAttendant(command.orderChannel)) {
      if (!actor.canAttend) {
        throw new AttendantRequiredError(
          `Channel ${command.orderChannel} can only be used by an attending staff member.`,
        );
      }
      return { attendantId: actor.id, customerId: command.customerId ?? null };
    }

    const source = channelCustomerSource(command.orderChannel);
    switch (source) {
      case 'authenticated':
        return { attendantId: null, customerId: actor.id };
      case 'anonymous':
        return { attendantId: null, customerId: null };
      case 'from-request':
        // Invariant: 'from-request' only pairs with requiresAttendant=true (handled above).
        // Reaching here means a channel policy is misconfigured: a 500-class bug, not user error.
        throw new Error(
          `Channel ${command.orderChannel} mixes 'from-request' with no attendant policy.`,
        );
      default: {
        // Compile-time exhaustiveness: a new CustomerSource must be handled above.
        const _exhaustive: never = source;
        throw new Error(`Unhandled customer source ${String(_exhaustive)}.`);
      }
    }
  }
}
