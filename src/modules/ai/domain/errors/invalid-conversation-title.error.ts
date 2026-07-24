import { DomainError } from '@shared/errors/domain/domain.error';
import { ERROR_KINDS } from '@shared/errors/errors.type';

/**
 * A rename that leaves nothing to store. The DTO rejects an outright empty string at
 * the HTTP border, but a title of only spaces or newlines passes @IsNotEmpty and
 * normalizes to empty - so the rule lives here, where every caller hits it and not
 * only the ones arriving over HTTP.
 */
export class InvalidConversationTitleError extends DomainError {
  constructor(message = 'A conversation title cannot be blank.', options?: { cause?: unknown }) {
    super(ERROR_KINDS.INVALID, message, options);
  }
}
