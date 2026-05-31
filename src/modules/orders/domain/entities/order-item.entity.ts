import Big from 'big.js';

export class OrderItem {
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

  static calculateSubtotal(quantity: number, unitPrice: Big | string): Big {
    return new Big(quantity).times(new Big(unitPrice));
  }
}
