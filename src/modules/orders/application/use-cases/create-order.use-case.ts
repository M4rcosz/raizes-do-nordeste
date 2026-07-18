import { OrderItem } from '@modules/orders/domain/entities/order-item.entity';
import { Order } from '@modules/orders/domain/entities/order.entity';
import {
  ORDER_REPOSITORY,
  type OrderRepository,
} from '@modules/orders/domain/repositories/order.repository';
import {
  channelCustomerSource,
  channelGuestNamePolicy,
  channelRequiresAttendant,
  OrderChannel,
} from '@modules/orders/domain/value-objects/order-channel';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Money } from '@shared/domain/value-objects/money';
import { AttendantRequiredError } from '../errors/attendant-required.error';
import { ConflictingCustomerIdentityError } from '../errors/conflicting-customer-identity.error';
import { GuestNameRequiredError } from '../errors/guest-name-required.error';
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
import {
  PROMOTION_APPLICATION,
  type PromotionApplication,
} from '@modules/promotions/application/ports/promotion-application.port';
import { PointsRedemptionRequiresCustomerError } from '../errors/points-redemption-requires-customer.error';
import {
  IDEMPOTENCY_STORE,
  type ExistingIdempotencyRecord,
  type IdempotencyStore,
} from '../ports/idempotency-store.port';
import { IdempotencyKeyConflictError } from '../errors/idempotency-key-conflict.error';
import { IdempotencyRaceError } from '../errors/idempotency-race.error';

/** How long a recorded Idempotency-Key is honored before the sweeper may reap it. */
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000; // 24h

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

/**
 * Optional idempotency envelope for a create attempt, built by the HTTP layer from the
 * Idempotency-Key header and a hash of the request body. Absent = no idempotency.
 */
export interface OrderIdempotency {
  key: string;
  userId: string;
  endpoint: string;
  requestHash: string;
}

export interface CreateOrderCommand {
  businessUnitId: string;
  customerId?: string;
  /** Guest display name; allowed and/or required per the channel's guest-name policy. */
  customerName?: string;
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
    @Inject(PROMOTION_APPLICATION)
    private readonly promotions: PromotionApplication,
    @Inject(IDEMPOTENCY_STORE)
    private readonly idempotency: IdempotencyStore,
  ) {}

  async execute(
    command: CreateOrderCommand,
    actor: Actor,
    idempotency?: OrderIdempotency,
  ): Promise<Order> {
    const {
      businessUnitId,
      orderChannel,
      notes,
      pointsRedeemed,
      orderItems: rawOrderItems,
    } = command;

    const { attendantId, customerId, customerName } = this.resolveParties(command, actor);

    const redeems = (pointsRedeemed ?? 0) > 0;
    // Points belong to a loyalty account: redeeming with no resolved customer has
    // nobody to debit. Reject before opening the tx (422).
    if (redeems && !customerId) {
      throw new PointsRedemptionRequiresCustomerError(
        'Cannot redeem loyalty points on an order without a customer.',
      );
    }

    // Fast path: a key already on file means this exact create already ran. Replay its
    // order (or 409 if the same key now carries a different body) without redoing work.
    if (idempotency) {
      const existing = await this.idempotency.find(idempotency);
      if (existing) {
        return this.replayOrder(existing, idempotency);
      }
    }

    // Validate and insert in one transaction, so the menu/product state can't change
    // between the read and the order insert.
    let committed: { order: Order; deduction: StockDeductionResult };
    try {
      committed = await this.transactions.run(async (tx) => {
        await this.assertOrderableProducts(command, tx);

        const orderItems = rawOrderItems.map((item) => ({
          ...item,
          subtotal: OrderItem.calculateSubtotal(item.quantity, item.unitPrice).toDecimalString(),
        }));

        const itemsSubtotal = Order.calculateItemsSubtotal(orderItems.map((item) => item.subtotal));

        // Discount composition (RN-promo): the promotion prices against the GROSS subtotal
        // first; loyalty then prices against the NET (subtotal - promo). Both ports are
        // two-step and deterministic - they need the DB-generated orderId for their rows
        // (OrderPromotion / REDEEM transaction), so we quote here to set the authoritative
        // total, create the order, then commit each side keyed to that id, all in this tx.
        // Order.discountAmount ends up promo + loyalty and Order.computeTotal re-checks the
        // [0, subtotal] band as the net backstop.
        const now = new Date();
        const promoDiscount = await this.quotePromoDiscount(businessUnitId, itemsSubtotal, now, tx);

        // Loyalty applies on what is left after the promotion, never on the gross.
        const subtotalAfterPromo = itemsSubtotal.minus(promoDiscount);
        const loyaltyDiscount = redeems
          ? Money.fromDecimalString(
              await this.redemption.quoteDiscount(
                {
                  customerId: customerId as string,
                  points: pointsRedeemed as number,
                  subtotal: subtotalAfterPromo.toDecimalString(),
                },
                tx,
              ),
            )
          : Money.zero();

        const discountAmount = promoDiscount.plus(loyaltyDiscount);
        const totalAmount = Order.computeTotal(itemsSubtotal, discountAmount).toDecimalString();

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
            customerName,
            attendantId,
            orderItems,
            totalAmount,
          },
          tx,
        );

        // Record the chosen promotion keyed to the new order id, in the same tx. The apply
        // re-selects from the same snapshot with the same `now`, so it lands on the promotion
        // the quote priced (deterministic). Only the promo's own discount is stored in
        // OrderPromotion.discountApplied - the loyalty parcel is not a promotion.
        if (promoDiscount.isPositive()) {
          await this.promotions.applyForOrder(
            {
              businessUnitId,
              orderId: created.id,
              subtotal: itemsSubtotal.toDecimalString(),
              now,
            },
            tx,
          );
        }

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
              subtotal: itemsSubtotal.toDecimalString(),
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

        // Record the key in THIS transaction so it commits with the order: the row can
        // never exist without its order. A duplicate key means a concurrent request won
        // the race - record throws IdempotencyRaceError and rolls this whole attempt back.
        if (idempotency) {
          await this.idempotency.record(
            {
              ...idempotency,
              orderId: created.id,
              expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
            },
            tx,
          );
        }

        return { order: created, deduction: deducted };
      });
    } catch (err) {
      // Lost the race: a concurrent request with the same key committed between our
      // fast-path read and our insert. Our attempt rolled back; replay the winner's.
      if (idempotency && err instanceof IdempotencyRaceError) {
        const existing = await this.idempotency.find(idempotency);
        if (existing) {
          return this.replayOrder(existing, idempotency);
        }
      }
      throw err;
    }
    const { order, deduction } = committed;

    // Best-effort audit after the order is committed; failures here never roll it back.
    await this.audit.log({
      userId: actor.id,
      action: AUDIT_ACTIONS.ORDER_CREATED,
      entity: 'Order',
      entityId: order.id,
      metadata: { orderChannel, totalAmount: order.totalAmount.toDecimalString() },
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
   * Returns the order a prior attempt already created under this key. The same key
   * with a different body is a reuse error (409); a vanished order is a referential
   * fault. No side effects re-run: the original attempt already audited and enrolled.
   */
  private async replayOrder(
    existing: ExistingIdempotencyRecord,
    idempotency: OrderIdempotency,
  ): Promise<Order> {
    if (existing.requestHash !== idempotency.requestHash) {
      throw new IdempotencyKeyConflictError();
    }
    // In the in-tx model the row always carries its order id; a null/missing order
    // means the row outlived its order, a data fault rather than user error.
    if (!existing.orderId) {
      throw new OrderReferenceNotFoundError('Idempotency record has no associated order.');
    }
    const order = await this.orders.findById(existing.orderId);
    if (!order) {
      throw new OrderReferenceNotFoundError(
        `Order ${existing.orderId} for this idempotency key no longer exists.`,
      );
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
   * Prices the order's promotion against the gross subtotal, or zero when none applies.
   * The selection (at most one promotion, MVP) and per-type pricing live behind the
   * promotions port; orders never reads the promotions domain. Read-only here - the
   * OrderPromotion row is written later via applyForOrder, once the order id exists.
   */
  private async quotePromoDiscount(
    businessUnitId: string,
    itemsSubtotal: Money,
    now: Date,
    tx: TransactionContext,
  ): Promise<Money> {
    const applied = await this.promotions.quoteDiscount(
      { businessUnitId, subtotal: itemsSubtotal.toDecimalString(), now },
      tx,
    );
    return applied ? Money.fromDecimalString(applied.discount) : Money.zero();
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
      if (!resolved.price.equals(Money.fromDecimalString(item.unitPrice))) {
        throw new PriceMismatchError(
          `Unit price ${item.unitPrice} does not match the authoritative price ${resolved.price.toDecimalString()} for product ${item.productId} at this business unit.`,
        );
      }
    }
  }

  /** Decides who the customer/attendant are based on the channel policy and the actor. */
  private resolveParties(
    command: CreateOrderCommand,
    actor: Actor,
  ): { attendantId: string | null; customerId: string | null; customerName: string | null } {
    const requiresAttendant = channelRequiresAttendant(command.orderChannel);
    // Authorization before payload rules: an actor who may not use the channel at all
    // should not learn whether their body was well formed.
    if (requiresAttendant && !actor.canAttend) {
      throw new AttendantRequiredError(
        `Channel ${command.orderChannel} can only be used by an attending staff member.`,
      );
    }

    // Resolved once for every channel: the guest-name rule is the policy table's job,
    // not something each branch below re-decides.
    const customerName = this.resolveCustomerName(command);

    if (requiresAttendant) {
      return { attendantId: actor.id, customerId: command.customerId ?? null, customerName };
    }

    const source = channelCustomerSource(command.orderChannel);
    switch (source) {
      case 'authenticated':
        return { attendantId: null, customerId: actor.id, customerName };
      case 'anonymous':
        return { attendantId: null, customerId: null, customerName };
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

  /**
   * Applies the channel's guest-name policy and the customerId/customerName exclusivity.
   * Returns the name to persist: null whenever an account is attached, because the display
   * name is then read live off the User relation instead of copied onto the order.
   */
  private resolveCustomerName(command: CreateOrderCommand): string | null {
    // Re-stripped and re-trimmed defensively: the DTO already does this at the border,
    // but the use case is the authoritative check, not the DTO. Unicode format
    // characters (zero-width space, BOM, category Cf) survive JS trim() and would
    // otherwise pass as a name with nothing readable in it.
    const trimmed = command.customerName?.replace(/\p{Cf}/gu, '').trim();
    // Punctuation/symbols-only (or nothing at all) is not a callable name either:
    // require at least one letter or digit for the value to count as present.
    const name = trimmed && /[\p{L}\p{N}]/u.test(trimmed) ? trimmed : null;
    const hasCustomer = Boolean(command.customerId);

    if (name && hasCustomer) {
      throw new ConflictingCustomerIdentityError(
        'An order carries either a customerId or a customerName, never both.',
      );
    }

    const policy = channelGuestNamePolicy(command.orderChannel);
    switch (policy) {
      case 'forbidden':
        // The logged-in account is the identity here; a separate name would compete with it.
        if (name) {
          throw new ConflictingCustomerIdentityError(
            `Channel ${command.orderChannel} identifies its customer by account; customerName is not accepted.`,
          );
        }
        return null;
      case 'required':
        if (!name) {
          throw new GuestNameRequiredError(
            `Channel ${command.orderChannel} requires a customerName to call the order.`,
          );
        }
        return name;
      case 'required-without-customer':
        if (!hasCustomer && !name) {
          throw new GuestNameRequiredError(
            `Channel ${command.orderChannel} requires either a customerId or a customerName.`,
          );
        }
        return name;
      default: {
        // Compile-time exhaustiveness: a new GuestNamePolicy must be handled above.
        const _exhaustive: never = policy;
        throw new Error(`Unhandled guest name policy ${String(_exhaustive)}.`);
      }
    }
  }
}
