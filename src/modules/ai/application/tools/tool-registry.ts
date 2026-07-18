import { Inject, Injectable, Logger } from '@nestjs/common';
import { ORDER_FOR_AI, type OrderForAi } from '@modules/orders/application/ports/order-for-ai.port';
import {
  LOYALTY_FOR_AI,
  type LoyaltyForAi,
} from '@modules/loyalty/application/ports/loyalty-for-ai.port';
import { USER_FOR_AI, type UserForAi } from '@modules/identity/application/ports/user-for-ai.port';
import {
  CATALOG_FOR_AI,
  type CatalogForAi,
} from '@modules/business-units/application/ports/catalog-for-ai.port';
import {
  INVENTORY_FOR_AI,
  type InventoryForAi,
} from '@modules/inventory/application/ports/inventory-for-ai.port';
import {
  PROMOTION_FOR_AI,
  type PromotionForAi,
} from '@modules/promotions/application/ports/promotion-for-ai.port';
import type { ActorContext } from '../actor-context';
import type { ToolCall, ToolDeclaration, ToolResult } from '../ports/chat-model.port';
import {
  FIND_ORDER_BY_ID,
  GET_MY_LOYALTY,
  LIST_BUSINESS_UNITS,
  LIST_CATEGORIES,
  LIST_INVENTORY,
  LIST_MENU_ITEMS,
  LIST_ORDERS,
  LIST_PROMOTIONS,
  LIST_USERS,
  TOOL_SPECS,
  isToolAllowedFor,
} from './tool-declarations';

/**
 * The read-only tools the model may call, plus their dispatcher. Every handler is
 * scoped to the acting user: the model supplies arguments but never the identity it
 * acts as, so it cannot widen access beyond what the caller could fetch directly.
 */
@Injectable()
export class ToolRegistry {
  private readonly logger = new Logger(ToolRegistry.name);

  constructor(
    @Inject(ORDER_FOR_AI)
    private readonly orderForAi: OrderForAi,
    @Inject(LOYALTY_FOR_AI)
    private readonly loyaltyForAi: LoyaltyForAi,
    @Inject(USER_FOR_AI)
    private readonly userForAi: UserForAi,
    @Inject(CATALOG_FOR_AI)
    private readonly catalogForAi: CatalogForAi,
    @Inject(INVENTORY_FOR_AI)
    private readonly inventoryForAi: InventoryForAi,
    @Inject(PROMOTION_FOR_AI)
    private readonly promotionForAi: PromotionForAi,
  ) {}

  /**
   * The tools this actor may use. Filtering here is token economy, not security: a
   * declaration the model never sees is one the caller does not pay for on every
   * model call, and one the model cannot waste a turn calling for an empty result.
   * The dispatch gate below is what actually enforces the role.
   */
  getDeclarations(actor: ActorContext): ToolDeclaration[] {
    return TOOL_SPECS.filter((spec) => spec.roles.includes(actor.role)).map(
      (spec) => spec.declaration,
    );
  }

  /**
   * Runs one tool call under the actor. Never throws: an unknown tool, or a handler
   * that fails (e.g. the repository throwing), comes back as an error ToolResult so
   * the loop can hand it to the model instead of tearing down the whole chat turn -
   * which would 500 after the model call for this turn was already metered.
   */
  async dispatch(call: ToolCall, actor: ActorContext): Promise<ToolResult> {
    // The real gate. A model can name a function that was never declared to it, so
    // the role is re-checked here rather than trusted from getDeclarations. A tool
    // this actor may not use is indistinguishable from one that does not exist.
    if (!isToolAllowedFor(call.name, actor.role)) {
      return { name: call.name, response: { error: 'unknown tool' } };
    }

    try {
      switch (call.name) {
        case FIND_ORDER_BY_ID:
          return await this.findOrderById(call, actor);
        case GET_MY_LOYALTY:
          return await this.getMyLoyalty(actor);
        case LIST_ORDERS:
          return await this.listOrders(call, actor);
        case LIST_USERS:
          return await this.listUsers(call, actor);
        case LIST_BUSINESS_UNITS:
          return await this.listBusinessUnits(call);
        case LIST_CATEGORIES:
          return await this.listCategories(call);
        case LIST_MENU_ITEMS:
          return await this.listMenuItems(call);
        case LIST_PROMOTIONS:
          return await this.listPromotions(call, actor);
        case LIST_INVENTORY:
          return await this.listInventory(call, actor);
        default:
          return { name: call.name, response: { error: 'unknown tool' } };
      }
    } catch (err) {
      // Log before degrading. The response stays generic (the model, and ultimately
      // the user, must not see the underlying detail), but swallowing silently would
      // make a dead database, a pool timeout and a mapper bug all look like a
      // cheerful 200 with no trace anywhere. This is the only place nine tools
      // across five contexts can fail, so it is the one place worth logging.
      this.logger.error(
        `Tool ${call.name} failed for user ${actor.userId}`,
        err instanceof Error ? err.stack : String(err),
      );
      return { name: call.name, response: { error: 'tool failed' } };
    }
  }

  private async findOrderById(call: ToolCall, actor: ActorContext): Promise<ToolResult> {
    const orderId = str(call.args.orderId);
    if (orderId === undefined) {
      return missingArg(call.name, 'orderId');
    }
    const order = await this.orderForAi.findByIdForActor(orderId, {
      userId: actor.userId,
      role: actor.role,
      businessUnitIds: actor.businessUnitIds,
    });
    const response = order ? { found: true, order } : { found: false };
    return { name: FIND_ORDER_BY_ID, response };
  }

  private async getMyLoyalty(actor: ActorContext): Promise<ToolResult> {
    // Force the customer id from the actor - never trust an id the model passed.
    const account = await this.loyaltyForAi.getForCustomer(actor.userId);
    const response = account ? { enrolled: true, loyalty: account } : { enrolled: false };
    return { name: GET_MY_LOYALTY, response };
  }

  private async listOrders(call: ToolCall, actor: ActorContext): Promise<ToolResult> {
    const result = await this.orderForAi.listForActor(
      {
        businessUnitId: str(call.args.businessUnitId),
        orderStatus: str(call.args.orderStatus),
        orderChannel: str(call.args.orderChannel),
        createdAtFrom: date(call.args.createdAtFrom),
        createdAtTo: date(call.args.createdAtTo),
      },
      { userId: actor.userId, role: actor.role, businessUnitIds: actor.businessUnitIds },
    );
    return { name: LIST_ORDERS, response: { ...result } };
  }

  private async listUsers(call: ToolCall, actor: ActorContext): Promise<ToolResult> {
    const result = await this.userForAi.listForActor(
      { username: str(call.args.username), businessUnitId: str(call.args.businessUnitId) },
      { userId: actor.userId, role: actor.role, businessUnitIds: actor.businessUnitIds },
    );
    return { name: LIST_USERS, response: { ...result } };
  }

  private async listBusinessUnits(call: ToolCall): Promise<ToolResult> {
    const result = await this.catalogForAi.listBusinessUnits(str(call.args.search));
    return { name: LIST_BUSINESS_UNITS, response: { ...result } };
  }

  private async listCategories(call: ToolCall): Promise<ToolResult> {
    const result = await this.catalogForAi.listCategories(str(call.args.search));
    return { name: LIST_CATEGORIES, response: { ...result } };
  }

  private async listMenuItems(call: ToolCall): Promise<ToolResult> {
    const businessUnitId = str(call.args.businessUnitId);
    if (businessUnitId === undefined) {
      return missingArg(call.name, 'businessUnitId');
    }
    const result = await this.catalogForAi.listMenuItems(businessUnitId);
    return { name: LIST_MENU_ITEMS, response: { ...result } };
  }

  private async listPromotions(call: ToolCall, actor: ActorContext): Promise<ToolResult> {
    const businessUnitId = str(call.args.businessUnitId);
    if (businessUnitId === undefined) {
      return missingArg(call.name, 'businessUnitId');
    }
    const result = await this.promotionForAi.listForActor(businessUnitId, {
      userId: actor.userId,
      role: actor.role,
      businessUnitIds: actor.businessUnitIds,
    });
    return { name: LIST_PROMOTIONS, response: { ...result } };
  }

  private async listInventory(call: ToolCall, actor: ActorContext): Promise<ToolResult> {
    const businessUnitId = str(call.args.businessUnitId);
    if (businessUnitId === undefined) {
      return missingArg(call.name, 'businessUnitId');
    }
    const result = await this.inventoryForAi.listForActor(businessUnitId, {
      userId: actor.userId,
      role: actor.role,
      businessUnitIds: actor.businessUnitIds,
    });
    return { name: LIST_INVENTORY, response: { ...result } };
  }
}

/**
 * A required argument the model did not send. `required` in a JSON schema is a hint
 * the model is free to ignore, so this is an expected path, not an exceptional one.
 * Unlike every other error here the message IS specific: it describes the model's own
 * input rather than our internals, and telling it what it omitted is what lets it
 * retry instead of giving up. Defaulting to '' instead would push an empty string
 * into a uuid column - a query that either errors or, for an actor whose scope check
 * passes, runs for real.
 */
function missingArg(toolName: string, argName: string): ToolResult {
  return { name: toolName, response: { error: `missing required argument: ${argName}` } };
}

/**
 * Tool args arrive as unknown: the model is free to send anything the schema asked
 * for and anything it did not. A non-string reads as absent rather than being
 * coerced, so a bad arg drops the filter instead of widening it.
 */
function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** An unparseable date reads as absent, for the same reason. */
function date(value: unknown): Date | undefined {
  const raw = str(value);
  if (raw === undefined) {
    return undefined;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}
