import { ApplicationError } from '@shared/errors/application/application.error';
import { ERROR_KINDS } from '@shared/errors/errors.type';

/**
 * The object storage provider failed (network, quota, 5xx). The SDK error is
 * kept on `cause` for logs; the message stays vendor-neutral and must never
 * carry the service key or a raw provider payload.
 */
export class ProductImageStorageError extends ApplicationError {
  constructor(
    message = 'Image storage is unavailable right now, please try again in a moment.',
    options?: { cause?: unknown },
  ) {
    super(ERROR_KINDS.UNAVAILABLE, message, options);
  }
}
