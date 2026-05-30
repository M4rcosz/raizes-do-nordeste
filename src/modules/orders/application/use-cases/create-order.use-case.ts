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
import { AttendantRequiredError } from '../errors/attendant-required.error';

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

    const orderItems = rawOrderItems.map((item) => ({
      ...item,
      subtotal: OrderItem.calculateSubtotal(item.quantity, item.unitPrice).toString(),
    }));

    const totalAmount = Order.calculateTotalAmount(
      orderItems.map((item) => item.subtotal),
    ).toString();

    return this.orders.create({
      businessUnitId,
      orderChannel,
      notes,
      pointsRedeemed,
      customerId,
      attendantId,
      orderItems,
      totalAmount,
    });
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

    if (channelCustomerSource(command.orderChannel) === 'anonymous') {
      return { attendantId: null, customerId: null };
    }

    // 'authenticated' channels (APP/WEB): the logged-in user is the customer.
    return { attendantId: null, customerId: actor.id };
  }
}
