import Big from 'big.js';

export class OrderItem {
  /** Line total (`quantity x unitPrice`), computed once at construction with `big.js` - never a float. */
  public readonly subtotal: Big;

  constructor(
    public readonly id: string,
    public readonly orderId: string,
    public readonly productId: string,
    public readonly quantity: number,
    public readonly unitPrice: Big,
    public readonly notes: string | null,
  ) {
    this.subtotal = OrderItem.calculateSubtotal(quantity, unitPrice);
  }

  /** Accepts `unitPrice` as `Big` or `string` so callers can compute a subtotal before an instance exists. */
  static calculateSubtotal(quantity: number, unitPrice: Big | string): Big {
    return new Big(quantity).times(new Big(unitPrice));
  }
}
