import { Inject, Injectable } from '@nestjs/common';
import { User } from '@modules/identity/domain/entities/user.entity';
import {
  USER_REPOSITORY,
  type CustomerContact,
  type UserRepository,
} from '@modules/identity/domain/repositories/user.repository';
import { UserNotFoundError } from '../errors/user-not-found.error';
import { UsersFetchError } from '../errors/users-fetch.error';

/**
 * Resolves one customer by an exact phone or email so an attendant can bind a
 * COUNTER/PICKUP order to an existing account. Deliberately a point lookup, never a
 * search: the contact value must match exactly, so a staff token cannot enumerate
 * customers. Not found, not a CUSTOMER and deactivated all raise the same
 * UserNotFoundError (404) - distinguishing them would let a caller probe whether a
 * given phone or email belongs to a privileged account.
 */
@Injectable()
export class LookupCustomerUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly users: UserRepository,
  ) {}

  async execute(contact: CustomerContact): Promise<User> {
    // Trim at the use case too: the DTO already does it, but the use case is the
    // authoritative check. An all-whitespace value must not become an empty-string
    // equality term that could match a blank column.
    const phone = contact.phone?.trim();
    const email = contact.email?.trim();
    const normalized: CustomerContact = {
      ...(phone && { phone }),
      ...(email && { email }),
    };

    // Exactly one field, enforced at the border by the DTO. Anything else here means
    // a caller bypassed it; answer with the same 404 rather than leaking that the
    // request shape was the problem.
    const provided = Object.keys(normalized).length;
    if (provided !== 1) {
      throw new UserNotFoundError('Customer not found.');
    }

    let user: User | null;
    try {
      user = await this.users.findActiveCustomerByContact(normalized);
    } catch (err) {
      throw new UsersFetchError('Could not look up the customer.', { cause: err });
    }

    if (!user) {
      throw new UserNotFoundError('Customer not found.');
    }
    return user;
  }
}
