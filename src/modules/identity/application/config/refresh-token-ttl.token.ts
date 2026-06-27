/**
 * DI token for the refresh-token lifetime in milliseconds. The module parses
 * JWT_REFRESH_TTL at boot and provides the number, keeping env parsing out of
 * the use cases (they just receive ms).
 */
export const REFRESH_TOKEN_TTL_MS = Symbol('RefreshTokenTtlMs');
