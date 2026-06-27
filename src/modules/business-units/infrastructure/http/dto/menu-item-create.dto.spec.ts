import { describe, expect, it } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { MenuItemCreateDto } from './menu-item-create.dto';

const VALID_PRODUCT_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

const validate = (payload: Record<string, unknown>): string[] => {
  const dto = plainToInstance(MenuItemCreateDto, payload);
  return validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }).flatMap((error) =>
    Object.values(error.constraints ?? {}),
  );
};

describe('MenuItemCreateDto', () => {
  it('accepts a valid positive customPrice', () => {
    expect(validate({ productId: VALID_PRODUCT_ID, customPrice: '18.50' })).toEqual([]);
  });

  it('rejects a zero customPrice ("0")', () => {
    const messages = validate({ productId: VALID_PRODUCT_ID, customPrice: '0' });
    expect(messages).toContain(
      'customPrice must be a positive decimal string with up to 2 decimal places',
    );
  });

  it('rejects a zero customPrice ("0.00")', () => {
    const messages = validate({ productId: VALID_PRODUCT_ID, customPrice: '0.00' });
    expect(messages).toContain(
      'customPrice must be a positive decimal string with up to 2 decimal places',
    );
  });

  it('rejects a customPrice with more than 2 decimal places', () => {
    const messages = validate({ productId: VALID_PRODUCT_ID, customPrice: '18.555' });
    expect(messages).toContain(
      'customPrice must be a positive decimal string with up to 2 decimal places',
    );
  });

  it('rejects a non-decimal customPrice', () => {
    const messages = validate({ productId: VALID_PRODUCT_ID, customPrice: 'abc' });
    expect(messages).toContain(
      'customPrice must be a positive decimal string with up to 2 decimal places',
    );
  });

  it('rejects a non-UUID productId', () => {
    const messages = validate({ productId: 'not-a-uuid', customPrice: '18.50' });
    expect(messages.some((message) => message.toLowerCase().includes('uuid'))).toBe(true);
  });

  it('accepts a body without isAvailable (optional)', () => {
    expect(validate({ productId: VALID_PRODUCT_ID, customPrice: '18.50' })).toEqual([]);
  });

  it('accepts a boolean isAvailable', () => {
    expect(
      validate({ productId: VALID_PRODUCT_ID, customPrice: '18.50', isAvailable: true }),
    ).toEqual([]);
  });
});
