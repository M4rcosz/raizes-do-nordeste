import { ApplicationError } from '@shared/errors/application/application.error';
import { ERROR_KINDS } from '@shared/errors/errors.type';

/**
 * Confirm was called but the bucket holds no object at that path: the client
 * never ran the PUT, or the signed URL expired mid-upload. Retry by minting a
 * fresh upload URL.
 */
export class ProductImageNotUploadedError extends ApplicationError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(ERROR_KINDS.NOT_FOUND, message, options);
  }
}
