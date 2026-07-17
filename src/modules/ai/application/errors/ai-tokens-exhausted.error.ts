import { ApplicationError } from '@shared/errors/application/application.error';
import { ERROR_KINDS } from '@shared/errors/errors.type';

/**
 * The user is enrolled but the token balance is already at zero. Distinct from
 * AiNotEnrolledError so the client can tell "top me up" from "enroll me".
 */
export class AiTokensExhaustedError extends ApplicationError {
  constructor(message = 'You are out of AI tokens; ask an admin to top up.') {
    super(ERROR_KINDS.FORBIDDEN, message);
  }
}
