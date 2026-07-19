import { describe, expect, it } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { LookupCustomerQueryDto } from './lookup-customer-query.dto';

const EXACTLY_ONE_MESSAGE = 'Exactly one of [phone, email] must be provided.';

const validate = (payload: Record<string, unknown>): string[] => {
  const dto = plainToInstance(LookupCustomerQueryDto, payload);
  return validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }).flatMap((error) =>
    Object.values(error.constraints ?? {}),
  );
};

describe('LookupCustomerQueryDto', () => {
  it('accepts a lone phone', () => {
    expect(validate({ phone: '+5581999999999' })).toEqual([]);
  });

  it('accepts a lone email', () => {
    expect(validate({ email: 'maria@example.com' })).toEqual([]);
  });

  // Neither means nothing to match on; an empty where would be a wildcard read.
  it('rejects a query with neither contact field', () => {
    expect(validate({})).toContain(EXACTLY_ONE_MESSAGE);
  });

  // Both would need an OR, turning a point lookup into two probes per request.
  it('rejects a query with both contact fields', () => {
    expect(validate({ phone: '+5581999999999', email: 'maria@example.com' })).toContain(
      EXACTLY_ONE_MESSAGE,
    );
  });

  // Registering a constraint on the carrier makes it a KNOWN property, so whitelist
  // does not strip it the way it strips a genuinely unknown key. @IsEmpty is what
  // keeps a client from setting it; without that it lands on the instance.
  it('rejects the exactly-one carrier property when a client sends it', () => {
    expect(validate({ phone: '+5581999999999', _contactField: 'x' })).not.toEqual([]);
  });

  it('rejects an explicit null (not skipped like undefined)', () => {
    // Regression: @IsOptional would skip null and let it through as "absent".
    expect(validate({ phone: null }).length).toBeGreaterThan(0);
  });

  it('rejects an empty phone', () => {
    expect(validate({ phone: '' }).length).toBeGreaterThan(0);
  });

  it('rejects a malformed email', () => {
    expect(validate({ email: 'not-an-email' }).length).toBeGreaterThan(0);
  });

  it('rejects a phone over the max length', () => {
    expect(validate({ phone: '1'.repeat(21) }).length).toBeGreaterThan(0);
  });

  it('normalizes email case so the citext column is matched consistently', () => {
    const dto = plainToInstance(LookupCustomerQueryDto, { email: 'Maria@Example.COM' });
    expect(dto.email).toBe('maria@example.com');
  });

  it('rejects an unknown key, so a stray filter cannot widen the query', () => {
    expect(
      validateSync(
        plainToInstance(LookupCustomerQueryDto, { phone: '+5581999999999', role: 'ADMIN' }),
        {
          whitelist: true,
          forbidNonWhitelisted: true,
        },
      ).length,
    ).toBeGreaterThan(0);
  });
});
