import { DomainError } from '@shared/errors/domain/domain.error';
import { ERROR_KINDS } from '@shared/errors/errors.type';

/**
 * A promotion was asked to price an order it is not eligible for (inactive, outside
 * its date window, or below its minimum order value). INVALID (422): a client could
 * resend without that promotion, or with a qualifying order.
 */
export class PromotionNotEligibleError extends DomainError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(ERROR_KINDS.INVALID, message, options);
  }
}
