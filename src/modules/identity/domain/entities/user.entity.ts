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

  /**
   * Verifies a password without leaking whether the username exists. When `user`
   * is `null` it still calls {@link PasswordHasher.verify} against a decoy so the
   * work (and timing) matches the real path, defeating user-enumeration by response
   * time. Always returns `false` for an unknown user.
   */
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
