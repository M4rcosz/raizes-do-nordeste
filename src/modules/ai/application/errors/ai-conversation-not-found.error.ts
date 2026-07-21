import { ApplicationError } from '@shared/errors/application/application.error';
import { ERROR_KINDS } from '@shared/errors/errors.type';

/**
 * No such conversation for this user. Deliberately also what a foreign or a
 * soft-deleted thread produces: a caller must not be able to tell "not yours" from
 * "does not exist" and probe for other people's threads.
 */
export class AiConversationNotFoundError extends ApplicationError {
  constructor(message = 'Conversation not found.', options?: { cause?: unknown }) {
    super(ERROR_KINDS.NOT_FOUND, message, options);
  }
}
