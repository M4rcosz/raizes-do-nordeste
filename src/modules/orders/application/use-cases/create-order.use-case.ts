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
import { Inject, Injectable, Logger } from '@nestjs/common';
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
import {
  STOCK_DEDUCTION,
  type StockDeduction,
  type StockDeductionResult,
} from '@modules/inventory/application/ports/stock-deduction.port';
import {
  LOYALTY_ENROLLMENT,
  type LoyaltyEnrollment,
} from '@modules/loyalty/application/ports/loyalty-enrollment.port';
import {
  LOYALTY_REDEMPTION,
  type LoyaltyRedemption,
} from '@modules/loyalty/application/ports/loyalty-redemption.port';
import { PointsRedemptionRequiresCustomerError } from '../errors/points-redemption-requires-customer.error';

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
  private readonly logger = new Logger(CreateOrderUseCase.name);

  constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly orders: OrderRepository,
    @Inject(ORDER_PRODUCT_LOOKUP)
    private readonly productLookup: OrderProductLookup,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_LOGGER)
    private readonly audit: AuditLogger,
    @Inject(STOCK_DEDUCTION)
    private readonly stock: StockDeduction,
    @Inject(LOYALTY_ENROLLMENT)
    private readonly enrollment: LoyaltyEnrollment,
    @Inject(LOYALTY_REDEMPTION)
    private readonly redemption: LoyaltyRedemption,
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

    const redeems = (pointsRedeemed ?? 0) > 0;
    // Points belong to a loyalty account: redeeming with no resolved customer has
    // nobody to debit. Reject before opening the tx (422).
    if (redeems && !customerId) {
      throw new PointsRedemptionRequiresCustomerError(
        'Cannot redeem loyalty points on an order without a customer.',
      );
    }

    // Validate and insert in one transaction, so the menu/product state can't change
    // between the read and the order insert.
    const { order, deduction } = await this.transactions.run(async (tx) => {
      await this.assertOrderableProducts(command, tx);

      const orderItems = rawOrderItems.map((item) => ({
        ...item,
        subtotal: OrderItem.calculateSubtotal(item.quantity, item.unitPrice).toString(),
      }));

      const itemsSubtotal = Order.calculateItemsSubtotal(orderItems.map((item) => item.subtotal));

      // The redeem discount needs the orderId for its REDEEM transaction row, but the
      // id is DB-generated at create. So we quote the discount first (read-only, sets
      // the authoritative total), create the order, then debit the points keyed to that
      // id - all inside this tx, so any later failure (stock) rolls the debit back with
      // the order. Loyalty rules and the rate stay behind the port; orders never reads
      // the loyalty domain. The discount is deterministic, so quote and debit agree.
      const discountAmount = redeems
        ? new Big(
            await this.redemption.quoteDiscount(
              {
                customerId: customerId as string,
                points: pointsRedeemed as number,
                subtotal: itemsSubtotal.toFixed(2),
              },
              tx,
            ),
          )
        : new Big(0);
      const totalAmount = Order.computeTotal(itemsSubtotal, discountAmount).toString();

      // pointsEarned stays at the DB default (0) on creation. Points (1 per R$10 of the
      // paid amount, gated by LoyaltyAccount consent) are credited by the loyalty module
      // when the payment is approved; LoyaltyTransaction is the source of truth.

      const created = await this.orders.create(
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

      if (redeems) {
        // Debit the points in the same tx. Insufficient balance (INVALID) or a
        // concurrent debit (CONFLICT) propagates and rolls back the order - redemption
        // is not best-effort. customerId is non-null here (guarded above).
        // TODO(loyalty-refund): when order cancellation/refund ships, credit the
        // redeemed points back with a compensating transaction.
        await this.redemption.redeemForOrder(
          {
            customerId: customerId as string,
            orderId: created.id,
            points: pointsRedeemed as number,
            subtotal: itemsSubtotal.toFixed(2),
          },
          tx,
        );
      }

      // Stock goes out in the same transaction: any item without enough stock
      // throws and rolls back the order plus every deduction already applied.
      const deducted = await this.stock.deductForOrder(
        {
          businessUnitId,
          orderId: created.id,
          actorId: actor.id,
          items: rawOrderItems.map(({ productId, quantity }) => ({ productId, quantity })),
        },
        tx,
      );

      return { order: created, deduction: deducted };
    });

    // Best-effort audit after the order is committed; failures here never roll it back.
    await this.audit.log({
      userId: actor.id,
      action: AUDIT_ACTIONS.ORDER_CREATED,
      entity: 'Order',
      entityId: order.id,
      metadata: { orderChannel, totalAmount: order.totalAmount.toFixed(2) },
    });

    await this.alertLowStock(businessUnitId, actor.id, deduction);

    // RN-30: the customer's loyalty account appears on their first order. Post-commit
    // and best-effort like the audit - loyalty must never fail or roll back an order.
    if (order.customerId) {
      try {
        await this.enrollment.ensureAccount(order.customerId);
      } catch (err) {
        this.logger.error(`Failed to ensure loyalty account for customer ${order.customerId}`, err);
      }
    }

    return order;
  }

  /**
   * RN-29: a STOCK_ALERT audit per item the order left at or below minQuantity.
   * Emitted after commit, like every audit here - inside the tx it could record
   * an alert for a deduction that rolls back.
   */
  private async alertLowStock(
    businessUnitId: string,
    actorId: string,
    deduction: StockDeductionResult,
  ): Promise<void> {
    for (const item of deduction.lowStock) {
      await this.audit.log({
        userId: actorId,
        action: AUDIT_ACTIONS.STOCK_ALERT,
        entity: 'Inventory',
        entityId: item.productId,
        metadata: {
          businessUnitId,
          productId: item.productId,
          quantity: item.quantity,
          minQuantity: item.minQuantity,
        },
      });
    }
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
