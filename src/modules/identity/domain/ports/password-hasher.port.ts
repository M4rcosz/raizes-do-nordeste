export interface PasswordHasher {
  hash(plainPassword: string): Promise<string>;
  verify(passwordHash: string | null, plainPassword: string): Promise<boolean>;
}

export const PASSWORD_HASHER = Symbol('PasswordHasher');
