import Big from 'big.js';

export class Product {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly description: string | null,
    /** Effective price in context: customPrice if fetched by business unit, base price otherwise. */
    public readonly price: Big,
    public readonly isActive: boolean,
    public readonly categoryId: string,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
    public readonly imageUrl: string,
  ) {}

  isAvailable(): boolean {
    return this.isActive;
  }
}
