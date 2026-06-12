import { Inject, Injectable } from '@nestjs/common';
import { UserRole } from '@modules/identity/domain/value-objects/user-role';
import { Order } from '@modules/orders/domain/entities/order.entity';
import {
  ORDER_REPOSITORY,
  type OrderRepository,
} from '@modules/orders/domain/repositories/order.repository';
import { OrderNotFoundError } from '../errors/order-not-found.error';

/** The authenticated principal asking for the order, resolved by the HTTP layer. */
export interface OrderRequester {
  id: string;
  role: UserRole;
}

@Injectable()
export class FindOrderByIdUseCase {
  constructor(
    @Inject(ORDER_REPOSITORY)
    private readonly orders: OrderRepository,
  ) {}

  async execute(id: string, requester: OrderRequester): Promise<Order> {
    const order = await this.orders.findById(id);

    // Customer sees only their own orders; staff sees any. Same 404 for missing and
    // not-yours, so existence is never leaked.
    // TODO(multi-unit): once the JWT carries the staff member's businessUnitId, scope
    // staff visibility to their own unit instead of brand-wide.
    const hiddenFromCustomer =
      requester.role === UserRole.CUSTOMER && order?.customerId !== requester.id;

    if (!order || hiddenFromCustomer) {
      throw new OrderNotFoundError(`Order ${id} was not found.`);
    }

    return order;
  }
}
