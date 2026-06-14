export class Inventory {
  constructor(
    public readonly id: string,
    public readonly businessUnitId: string,
    public readonly productId: string,
    public readonly quantity: number,
    public readonly minQuantity: number,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  /** At or below the replenishment threshold - callers raise a STOCK_ALERT. */
  isLowStock(): boolean {
    return this.quantity <= this.minQuantity;
  }
}
