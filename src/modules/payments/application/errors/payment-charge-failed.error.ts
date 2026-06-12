import { ApplicationError } from '@shared/errors/application/application.error';
import { ERROR_KINDS } from '@shared/errors/errors.type';

/**
 * The gateway charge could not be completed (technical failure). Maps to 503: a transient
 * gateway problem, not the caller's fault. `ambiguous` records whether the outcome is
 * unknown (money may have moved) - when true the attempt is kept for reconciliation and a
 * blind retry is blocked by the live-attempt guard, so the caller cannot double-charge.
 */
export class PaymentChargeFailedError extends ApplicationError {
  constructor(
    message: string,
    readonly ambiguous: boolean,
    options?: { cause?: unknown },
  ) {
    super(ERROR_KINDS.UNAVAILABLE, message, options);
  }
}
