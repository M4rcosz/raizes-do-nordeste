import { randomUUID } from 'node:crypto';
import { PasswordHasher } from '../ports/password-hasher.port';
import type { CreateUserInput } from '../repositories/user.repository';
import { UserRole } from '../value-objects/user-role';

export interface RegisterUserProps {
  name: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  email?: string | null;
  phone?: string | null;
  businessUnitId?: string | null;
}

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
   * Builds a brand-new user. Receives an already-computed hash (the use case owns the
   * hasher), generates the id and timestamps, and starts the account active. `updatedBy`
   * is null on creation. Persistence may rely on this id (it is a valid uuid).
   */
  static register(props: RegisterUserProps): User {
    const now = new Date();
    return new User(
      randomUUID(),
      props.businessUnitId ?? null,
      props.username,
      props.name,
      props.email ?? null,
      props.passwordHash,
      props.phone ?? null,
      now,
      now,
      null,
      props.role,
      true,
    );
  }

  /** Whether this account may authenticate. Inactive users cannot log in. */
  canLogIn(): boolean {
    return this.isActive;
  }

  /**
   * Flat snapshot the repository persists. Lives here so the password hash never
   * leaves the entity through a public getter; the repo writes these fields as-is.
   */
  toCreateInput(): CreateUserInput {
    return {
      id: this.id,
      businessUnitId: this.businessUnitId,
      username: this.username,
      name: this.name,
      email: this.email,
      passwordHash: this.passwordHash,
      phone: this.phone,
      role: this.role,
      isActive: this.isActive,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

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
