import { describe, expect, it } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { AdjustInventoryDto } from './adjust-inventory.dto';
import { InventoryTransactionType } from '@modules/inventory/domain/value-objects/inventory-transaction-type';
import { MAX_INVENTORY_QUANTITY } from '@modules/inventory/domain/value-objects/inventory-quantity';

const validate = (payload: Record<string, unknown>): string[] => {
  const dto = plainToInstance(AdjustInventoryDto, payload);
  return validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }).flatMap((error) =>
    Object.values(error.constraints ?? {}),
  );
};

const valid = {
  productId: '3f1e6a5c-0d2b-4c8e-9a7f-1b2c3d4e5f60',
  type: InventoryTransactionType.IN,
  quantity: 10,
  reason: 'Weekly restock delivery.',
};

describe('AdjustInventoryDto', () => {
  it('accepts a well-formed body', () => {
    expect(validate(valid)).toEqual([]);
  });

  it('accepts exactly the int4 maximum', () => {
    expect(validate({ ...valid, quantity: MAX_INVENTORY_QUANTITY })).toEqual([]);
  });

  it('rejects a quantity above int4, which would 500 on update', () => {
    expect(validate({ ...valid, quantity: MAX_INVENTORY_QUANTITY + 1 }).length).toBeGreaterThan(0);
  });

  it('rejects a zero movement: type carries the direction, quantity the magnitude', () => {
    expect(validate({ ...valid, quantity: 0 }).length).toBeGreaterThan(0);
  });

  it('rejects a movement type that is not manually applicable', () => {
    expect(validate({ ...valid, type: InventoryTransactionType.RESERVE }).length).toBeGreaterThan(
      0,
    );
  });
});
