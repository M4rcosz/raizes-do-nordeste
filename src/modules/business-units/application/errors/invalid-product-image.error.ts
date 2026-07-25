import { ApplicationError } from '@shared/errors/application/application.error';
import { ERROR_KINDS } from '@shared/errors/errors.type';

/**
 * The uploaded object exists but fails the catalog's image policy: a content
 * type outside the allowlist, an empty object, or one over the size cap. The
 * check reads what the bucket stored, never what the mint request claimed.
 */
export class InvalidProductImageError extends ApplicationError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(ERROR_KINDS.INVALID, message, options);
  }
}
