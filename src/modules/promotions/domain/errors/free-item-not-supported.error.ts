import { DomainError } from '@shared/errors/domain/domain.error';
import { ERROR_KINDS } from '@shared/errors/errors.type';

/**
 * A FREE_ITEM promotion reached pricing. FREE_ITEM is out of MVP scope - the schema
 * has no target-item column, so there is nothing to give away deterministically.
 * INVALID (422): the promotion is misconfigured for what this version can apply.
 */
export class FreeItemNotSupportedError extends DomainError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(ERROR_KINDS.INVALID, message, options);
  }
}
