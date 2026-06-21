import { ApplicationError } from '@shared/errors/application/application.error';
import { ERROR_KINDS } from '@shared/errors/errors.type';

/** A read against the promotion store failed (infra fault wrapped via cause). */
export class PromotionsFetchError extends ApplicationError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(ERROR_KINDS.UNAVAILABLE, message, options);
  }
}
