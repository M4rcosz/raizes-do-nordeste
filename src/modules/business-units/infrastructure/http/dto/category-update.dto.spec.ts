import { describe, expect, it } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CategoryUpdateDto } from './category-update.dto';

const validate = (payload: Record<string, unknown>): string[] => {
  const dto = plainToInstance(CategoryUpdateDto, payload);
  return validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }).flatMap((error) =>
    Object.values(error.constraints ?? {}),
  );
};

describe('CategoryUpdateDto', () => {
  it('accepts a body with only name', () => {
    expect(validate({ name: 'Sobremesas' })).toEqual([]);
  });

  it('accepts a body with only isActive', () => {
    expect(validate({ isActive: false })).toEqual([]);
  });

  it('accepts a subset of several fields', () => {
    expect(validate({ name: 'Sobremesas', description: 'Doces', isActive: true })).toEqual([]);
  });

  it('rejects an empty body (no patchable field present)', () => {
    expect(validate({})).toContain(
      'At least one of [name, description, isActive] must be provided.',
    );
  });

  it('rejects a non-string name', () => {
    expect(validate({ name: 42 }).length).toBeGreaterThan(0);
  });
});
