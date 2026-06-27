import { Money } from '@shared/domain/value-objects/money';

/**
 * A product offered by a specific business unit, with its own price and
 * availability flag. The product itself lives in its own catalog; this entity
 * is the join that makes it sellable at a unit.
 */
export class MenuItem {
  constructor(
    public readonly id: string,
    public readonly businessUnitId: string,
    public readonly productId: string,
    public readonly customPrice: Money,
    public readonly isAvailable: boolean,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}
}
