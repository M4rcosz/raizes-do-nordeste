import { describe, expect, it } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CategoryCreateDto } from './category-create.dto';

const validate = (payload: Record<string, unknown>): string[] => {
  const dto = plainToInstance(CategoryCreateDto, payload);
  return validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }).flatMap((error) =>
    Object.values(error.constraints ?? {}),
  );
};

describe('CategoryCreateDto', () => {
  it('accepts a name-only body (description optional)', () => {
    expect(validate({ name: 'Bebidas' })).toEqual([]);
  });

  it('accepts a name plus description', () => {
    expect(validate({ name: 'Bebidas', description: 'Sucos' })).toEqual([]);
  });

  it('rejects a missing name', () => {
    expect(validate({ description: 'Sucos' }).length).toBeGreaterThan(0);
  });

  it('rejects a non-string name', () => {
    expect(validate({ name: 42 }).length).toBeGreaterThan(0);
  });

  it('rejects a name longer than 100 chars', () => {
    expect(validate({ name: 'x'.repeat(101) }).length).toBeGreaterThan(0);
  });
});
