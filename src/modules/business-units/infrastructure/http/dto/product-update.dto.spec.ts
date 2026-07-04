import { describe, expect, it } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ProductUpdateDto } from './product-update.dto';

const validate = (payload: Record<string, unknown>): string[] => {
  const dto = plainToInstance(ProductUpdateDto, payload);
  return validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }).flatMap((error) =>
    Object.values(error.constraints ?? {}),
  );
};

describe('ProductUpdateDto', () => {
  it('accepts a body with only name', () => {
    expect(validate({ name: 'Vatapá' })).toEqual([]);
  });

  it('accepts a body with only price', () => {
    expect(validate({ price: '20.00' })).toEqual([]);
  });

  it('accepts a subset of several fields', () => {
    expect(
      validate({
        name: 'Vatapá',
        price: '20.00',
        categoryId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      }),
    ).toEqual([]);
  });

  it('rejects an empty body (no patchable field present)', () => {
    expect(validate({})).toContain(
      'At least one of [name, description, price, categoryId, imageUrl] must be provided.',
    );
  });

  it('rejects a non-positive price', () => {
    expect(validate({ price: '0.00' })).toContain(
      'price must be a positive decimal string with up to 2 decimal places',
    );
  });

  it('rejects a malformed price string', () => {
    expect(validate({ price: 'abc' })).toContain(
      'price must be a positive decimal string with up to 2 decimal places',
    );
  });

  it('rejects a non-uuid categoryId', () => {
    expect(validate({ categoryId: 'not-a-uuid' }).length).toBeGreaterThan(0);
  });
});
