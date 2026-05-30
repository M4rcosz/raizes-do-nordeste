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

/** Who is performing the operation, resolved from the auth token by the HTTP layer. */
export interface Actor {
  id: string;
  /** Whether the actor is a staff member (not a plain customer) and may attend orders. */
  isStaff: boolean;
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

    // Validate and persist atomically: the menu/product state read here must not
    // change before the order insert, so both share one transaction.
    return this.transactions.run(async (tx) => {
      await this.assertOrderableProducts(command, tx);

      const orderItems = rawOrderItems.map((item) => ({
        ...item,
        subtotal: OrderItem.calculateSubtotal(item.quantity, item.unitPrice).toString(),
      }));

      const totalAmount = Order.calculateTotalAmount(
        orderItems.map((item) => item.subtotal),
      ).toString();

      // TODO(loyalty): when the loyalty module ships, set pointsEarned = floor(totalAmount)
      // only if the customer has a LoyaltyAccount with consentGiven=true; otherwise 0.
      // Today no loyalty data exists, so every order keeps pointsEarned at the DB default (0).

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
  }

  /**
   * Rejects orders that reference a product not on this unit's menu (404), a product
   * that is inactive brand-wide (422), a menu item currently unavailable (422), or a
   * unitPrice that diverges from the authoritative price (422). Authoritative price is
   * BusinessUnitMenuItem.customPrice — only menu items are orderable.
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
      if (!actor.isStaff) {
        throw new AttendantRequiredError(
          `Channel ${command.orderChannel} can only be used by a staff member.`,
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
        // Unreachable today: 'from-request' only pairs with requiresAttendant=true.
        throw new Error(
          `Channel ${command.orderChannel} mixes 'from-request' with no attendant policy.`,
        );
    }
  }
}
