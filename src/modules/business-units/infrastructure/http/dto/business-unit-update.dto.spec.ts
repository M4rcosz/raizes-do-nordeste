import { describe, expect, it } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { BusinessUnitUpdateDto } from './business-unit-update.dto';

const validate = (payload: Record<string, unknown>): string[] => {
  const dto = plainToInstance(BusinessUnitUpdateDto, payload);
  return validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }).flatMap((error) =>
    Object.values(error.constraints ?? {}),
  );
};

describe('BusinessUnitUpdateDto', () => {
  it('accepts a body with a single editable field', () => {
    expect(validate({ name: 'Raízes Pelourinho' })).toEqual([]);
  });

  it('accepts a subset of several fields', () => {
    expect(validate({ address: 'Largo do Pelourinho, 10', city: 'Salvador' })).toEqual([]);
  });

  it('rejects an empty body (no patchable field present)', () => {
    expect(validate({})).toContain(
      'At least one of [name, address, city, phone] must be provided.',
    );
  });

  it('rejects an explicit null (not skipped like undefined)', () => {
    // Regression: @IsOptional would skip null and let it reach Prisma as a 500.
    expect(validate({ name: null }).length).toBeGreaterThan(0);
  });

  it('rejects an empty string', () => {
    expect(validate({ phone: '' }).length).toBeGreaterThan(0);
  });

  it('rejects a non-string field', () => {
    expect(validate({ name: 42 }).length).toBeGreaterThan(0);
  });

  it('rejects a value over the max length', () => {
    expect(validate({ city: 'x'.repeat(121) }).length).toBeGreaterThan(0);
  });
});
