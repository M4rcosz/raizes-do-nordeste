import argon from 'argon2';
import { PasswordHasher } from '../../domain/ports/password-hasher.port';
import { Injectable } from '@nestjs/common';

const ARGON_OPTIONS = {
  type: argon.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class Argon2PasswordHasher implements PasswordHasher {
  private dummyHash?: string;

  async hash(password: string): Promise<string> {
    return await argon.hash(password, ARGON_OPTIONS);
  }

  async verify(passwordHash: string | null, password: string): Promise<boolean> {
    const hashToCheck = passwordHash ?? (await this.getDummyHash());
    try {
      const ok = await argon.verify(hashToCheck, password);
      return passwordHash !== null && ok;
    } catch (err) {
      console.warn('argon2.verify failed', { cause: err });
      return false;
    }
  }

  private async getDummyHash(): Promise<string> {
    return (this.dummyHash ??= await this.hash('dummy-password-never-match'));
  }
}
