import { Inject, Injectable } from '@nestjs/common';
import { ORDER_FOR_AI, type OrderForAi } from '@modules/orders/application/ports/order-for-ai.port';
import {
  LOYALTY_FOR_AI,
  type LoyaltyForAi,
} from '@modules/loyalty/application/ports/loyalty-for-ai.port';
import type { ActorContext } from '../actor-context';
import type { ToolCall, ToolDeclaration, ToolResult } from '../ports/chat-model.port';

const FIND_ORDER_BY_ID = 'findOrderById';
const GET_MY_LOYALTY = 'getMyLoyalty';

/**
 * The read-only tools the model may call, plus their dispatcher. Every handler is
 * scoped to the acting user: the model supplies arguments but never the identity it
 * acts as, so it cannot widen access beyond what the caller could fetch directly.
 */
@Injectable()
export class ToolRegistry {
  constructor(
    @Inject(ORDER_FOR_AI)
    private readonly orderForAi: OrderForAi,
    @Inject(LOYALTY_FOR_AI)
    private readonly loyaltyForAi: LoyaltyForAi,
  ) {}

  getDeclarations(): ToolDeclaration[] {
    return [
      {
        name: FIND_ORDER_BY_ID,
        description:
          'Look up one order by its id and return its status, channel, total, and line items. Only returns orders the current user is allowed to see.',
        parametersJsonSchema: {
          type: 'object',
          properties: {
            orderId: {
              type: 'string',
              format: 'uuid',
              description: 'The id of the order to look up.',
            },
          },
          required: ['orderId'],
        },
      },
      {
        name: GET_MY_LOYALTY,
        description:
          "Return the current user's own loyalty account: points balance, consent status, and enrollment date.",
        parametersJsonSchema: {
          type: 'object',
          properties: {},
        },
      },
    ];
  }

  /**
   * Runs one tool call under the actor. Never throws: an unknown tool, or a handler
   * that fails (e.g. the repository throwing), comes back as an error ToolResult so
   * the loop can hand it to the model instead of tearing down the whole chat turn -
   * which would 500 after the model call for this turn was already metered.
   */
  async dispatch(call: ToolCall, actor: ActorContext): Promise<ToolResult> {
    try {
      switch (call.name) {
        case FIND_ORDER_BY_ID:
          return await this.findOrderById(call, actor);
        case GET_MY_LOYALTY:
          return await this.getMyLoyalty(actor);
        default:
          return { name: call.name, response: { error: 'unknown tool' } };
      }
    } catch {
      // Generic on purpose: the model (and ultimately the user) must not see the
      // underlying error detail. The turn continues with a failed-tool signal.
      return { name: call.name, response: { error: 'tool failed' } };
    }
  }

  private async findOrderById(call: ToolCall, actor: ActorContext): Promise<ToolResult> {
    const orderId = typeof call.args.orderId === 'string' ? call.args.orderId : '';
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
}
