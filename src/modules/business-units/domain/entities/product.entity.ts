import { Money } from '@shared/domain/value-objects/money';

export class Product {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly description: string | null,
    /** Effective price in context: customPrice if fetched by business unit, base price otherwise. */
    public readonly price: Money,
    public readonly isActive: boolean,
    public readonly categoryId: string,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
    public readonly imageUrl: string,
  ) {}

  isAvailable(): boolean {
    return this.isActive;
  }

  // Returns a new Product with only the provided keys overwritten. Immutable:
  // the receiver is untouched. Identity and lifecycle fields (id, isActive,
  // createdAt, updatedAt) are never patchable here - isActive has its own toggle
  // and timestamps are owned by persistence. A field is considered provided only
  // when its value is not undefined, so passing description: null clears it.
  withUpdatedFields(patch: {
    name?: string;
    description?: string | null;
    price?: Money;
    categoryId?: string;
    imageUrl?: string;
  }): Product {
    return new Product(
      this.id,
      patch.name !== undefined ? patch.name : this.name,
      patch.description !== undefined ? patch.description : this.description,
      patch.price !== undefined ? patch.price : this.price,
      this.isActive,
      patch.categoryId !== undefined ? patch.categoryId : this.categoryId,
      this.createdAt,
      this.updatedAt,
      patch.imageUrl !== undefined ? patch.imageUrl : this.imageUrl,
    );
  }
}
