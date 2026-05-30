import { PasswordHasher } from '../ports/password-hasher.port';
import { UserRole } from '../value-objects/user-role';

export class User {
  constructor(
    public readonly id: string,
    public readonly businessUnitId: string | null,
    public readonly username: string,
    public readonly name: string,
    public readonly email: string | null,
    private readonly passwordHash: string,
    public readonly phone: string | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
    public readonly updatedBy: string | null,
    public readonly role: UserRole,
    public readonly isActive: boolean,
  ) {}

  static async verifyPasswordOrDecoy(
    user: User | null,
    plainPassword: string,
    hasher: PasswordHasher,
  ): Promise<boolean> {
    return user ? user.verifyPassword(plainPassword, hasher) : hasher.verify(null, plainPassword);
  }

  private verifyPassword(plainPassword: string, hasher: PasswordHasher): Promise<boolean> {
    return hasher.verify(this.passwordHash, plainPassword);
  }
}
