import { Transform } from 'class-transformer';
import { normalizeEmail } from '@modules/identity/domain/value-objects/email-normalization';

// class-transformer adapter: canonicalize the email before validation runs. The
// string guard lets a non-string fall through untouched so @IsEmail rejects it.
export function NormalizeEmail(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeEmail(value) : value,
  );
}
