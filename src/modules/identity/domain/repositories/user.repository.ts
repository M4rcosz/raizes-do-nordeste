import { User } from '../entities/user.entity';

export interface UserRepository {
  findByUsername(username: string): Promise<User | null>;
}

export const USER_REPOSITORY = Symbol('UserRepository');
