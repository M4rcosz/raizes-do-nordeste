import { Inject, Injectable } from '@nestjs/common';
import { User } from '@modules/identity/domain/entities/user.entity';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '@modules/identity/domain/repositories/user.repository';
import { UserNotFoundError } from '../errors/user-not-found.error';
import { UsersFetchError } from '../errors/users-fetch.error';

/**
 * Reads the authenticated user's own record. actorId always comes from the JWT
 * (the controller passes actor.sub), so this is self-read only, never a lookup
 * of an arbitrary id. A valid token whose user was deleted yields NOT_FOUND.
 */
@Injectable()
export class GetMyProfileUseCase {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly users: UserRepository,
  ) {}

  async execute(actorId: string): Promise<User> {
    let user: User | null;
    try {
      user = await this.users.findById(actorId);
    } catch (err) {
      throw new UsersFetchError('Could not retrieve your profile.', { cause: err });
    }

    if (!user) {
      throw new UserNotFoundError(`User ${actorId} not found.`);
    }
    return user;
  }
}
