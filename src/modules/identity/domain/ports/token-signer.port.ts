import { JwtPayloadSign } from '@shared/auth/jwt-payload.type';

/** Signs an access token from a payload; the seam between the application and the JWT adapter. */
export interface TokenSigner {
  sign(payload: JwtPayloadSign): Promise<string>;
}

export const TOKEN_SIGNER = Symbol('TokenSigner');
