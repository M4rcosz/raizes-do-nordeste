import { Money } from '@shared/domain/value-objects/money';

export class OrderItem {
  /** Line total (`quantity x unitPrice`), computed once at construction with Money - never a float. */
  public readonly subtotal: Money;

  constructor(
    public readonly id: string,
    public readonly orderId: string,
    public readonly productId: string,
    /** Product name as it was when the order was placed, not the product's current name. */
    public readonly productName: string,
    public readonly quantity: number,
    public readonly unitPrice: Money,
    public readonly notes: string | null,
  ) {
    this.subtotal = OrderItem.calculateSubtotal(quantity, unitPrice);
  }

  /** Accepts `unitPrice` as `Money` or `string` so callers can compute a subtotal before an instance exists. */
  static calculateSubtotal(quantity: number, unitPrice: Money | string): Money {
    const price = typeof unitPrice === 'string' ? Money.fromDecimalString(unitPrice) : unitPrice;
    return price.times(quantity);
  }
}
