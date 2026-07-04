import { describe, expect, it } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { IsOptional, IsString, validateSync } from 'class-validator';
import { AtLeastOneOf } from './at-least-one-of';

class SamplePatchDto {
  @IsOptional()
  @IsString()
  a?: string;

  @IsOptional()
  @IsString()
  b?: string;

  @AtLeastOneOf(['a', 'b'])
  readonly _atLeastOneField?: never;
}

const validate = (payload: Record<string, unknown>): string[] => {
  const dto = plainToInstance(SamplePatchDto, payload);
  return validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }).flatMap((error) =>
    Object.values(error.constraints ?? {}),
  );
};

describe('AtLeastOneOf', () => {
  it('passes when one of the properties is present', () => {
    expect(validate({ a: 'x' })).toEqual([]);
  });

  it('passes when another of the properties is present', () => {
    expect(validate({ b: 'y' })).toEqual([]);
  });

  it('passes when all listed properties are present', () => {
    expect(validate({ a: 'x', b: 'y' })).toEqual([]);
  });

  it('fails with the default message when none are present', () => {
    expect(validate({})).toContain('At least one of [a, b] must be provided.');
  });

  it('treats an explicit undefined as absent', () => {
    expect(validate({ a: undefined })).toContain('At least one of [a, b] must be provided.');
  });
});
