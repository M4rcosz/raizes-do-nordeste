import { describe, expect, it } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { InitializeInventoryItemDto } from './initialize-inventory-item.dto';
import { MAX_INVENTORY_QUANTITY } from '@modules/inventory/domain/value-objects/inventory-quantity';

const validate = (payload: Record<string, unknown>): string[] => {
  const dto = plainToInstance(InitializeInventoryItemDto, payload);
  return validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }).flatMap((error) =>
    Object.values(error.constraints ?? {}),
  );
};

const valid = {
  productId: '3f1e6a5c-0d2b-4c8e-9a7f-1b2c3d4e5f60',
  quantity: 10,
  minQuantity: 5,
  reason: 'Opening stock count.',
};

describe('InitializeInventoryItemDto', () => {
  it('accepts a well-formed body', () => {
    expect(validate(valid)).toEqual([]);
  });

  it('accepts a zero opening balance', () => {
    expect(validate({ ...valid, quantity: 0 })).toEqual([]);
  });

  it('accepts exactly the int4 maximum', () => {
    expect(validate({ ...valid, quantity: MAX_INVENTORY_QUANTITY })).toEqual([]);
  });

  it('rejects a quantity above int4, which would 500 on insert', () => {
    expect(validate({ ...valid, quantity: MAX_INVENTORY_QUANTITY + 1 }).length).toBeGreaterThan(0);
  });

  it('rejects a minQuantity above int4', () => {
    expect(validate({ ...valid, minQuantity: MAX_INVENTORY_QUANTITY + 1 }).length).toBeGreaterThan(
      0,
    );
  });

  it('rejects a negative quantity', () => {
    expect(validate({ ...valid, quantity: -1 }).length).toBeGreaterThan(0);
  });

  it('rejects a fractional quantity', () => {
    expect(validate({ ...valid, quantity: 1.5 }).length).toBeGreaterThan(0);
  });

  it('rejects a non-uuid productId', () => {
    expect(validate({ ...valid, productId: 'nope' }).length).toBeGreaterThan(0);
  });

  it('rejects a reason longer than 150 chars', () => {
    expect(validate({ ...valid, reason: 'x'.repeat(151) }).length).toBeGreaterThan(0);
  });

  it('rejects a businessUnitId smuggled in the body', () => {
    // The unit comes from the route param; forbidNonWhitelisted must reject it here.
    expect(validate({ ...valid, businessUnitId: 'bu-9' }).length).toBeGreaterThan(0);
  });
});
