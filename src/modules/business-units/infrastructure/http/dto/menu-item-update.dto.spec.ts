import { describe, expect, it } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { MenuItemUpdateDto } from './menu-item-update.dto';

const validate = (payload: Record<string, unknown>): string[] => {
  const dto = plainToInstance(MenuItemUpdateDto, payload);
  return validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }).flatMap((error) =>
    Object.values(error.constraints ?? {}),
  );
};

describe('MenuItemUpdateDto', () => {
  it('accepts a body with only customPrice', () => {
    expect(validate({ customPrice: '18.50' })).toEqual([]);
  });

  it('accepts a body with only isAvailable', () => {
    expect(validate({ isAvailable: false })).toEqual([]);
  });

  it('rejects an empty body (no patchable field present)', () => {
    const messages = validate({});
    expect(messages).toContain('At least one of [customPrice, isAvailable] must be provided.');
  });

  it('rejects a non-positive customPrice', () => {
    const messages = validate({ customPrice: '0.00' });
    expect(messages).toContain(
      'customPrice must be a positive decimal string with up to 2 decimal places',
    );
  });
});
