import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  GeneratedRefreshToken,
  RefreshTokenGenerator,
} from '@modules/identity/domain/ports/refresh-token-generator.port';

// 32 bytes of CSPRNG output (256 bits). base64url keeps it URL/JSON-safe. With
// this much entropy a plain SHA-256 of the value is enough at rest: there is
// nothing to brute-force, so a slow hash (argon2) would only waste CPU.
const TOKEN_BYTES = 32;

@Injectable()
export class CryptoRefreshTokenGenerator implements RefreshTokenGenerator {
  generate(): GeneratedRefreshToken {
    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    return { token, tokenHash: this.hash(token) };
  }

  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
