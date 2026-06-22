import { DomainError } from '@shared/errors/domain/domain.error';
import { ERROR_KINDS } from '@shared/errors/errors.type';

/** A business unit with the same unique field (cnpj or phone) already exists. */
export class BusinessUnitAlreadyExistsError extends DomainError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(ERROR_KINDS.CONFLICT, message, options);
  }
}
