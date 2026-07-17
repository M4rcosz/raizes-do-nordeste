import { ApplicationError } from '@shared/errors/application/application.error';
import { ERROR_KINDS } from '@shared/errors/errors.type';

/**
 * The upstream chat provider failed (network, quota, 5xx). Wraps the SDK error as
 * `cause` for logs but surfaces a friendly, vendor-neutral message to the client.
 */
export class AiProviderUnavailableError extends ApplicationError {
  constructor(
    message = 'The assistant is busy right now, please try again in a moment.',
    options?: { cause?: unknown },
  ) {
    super(ERROR_KINDS.UNAVAILABLE, message, options);
  }
}
