import { ApplicationError } from '@shared/errors/application/application.error';
import { ERROR_KINDS } from '@shared/errors/errors.type';

/**
 * An order asked to redeem points but resolved to no customer (e.g. an anonymous
 * channel). Points belong to a loyalty account, so there is nobody to debit - the
 * request is malformed (422), not a server fault.
 */
export class PointsRedemptionRequiresCustomerError extends ApplicationError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(ERROR_KINDS.INVALID, message, options);
  }
}
