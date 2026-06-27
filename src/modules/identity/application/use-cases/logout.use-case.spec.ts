import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { LogoutUseCase } from './logout.use-case';
import { RefreshTokenFetchError } from '../errors/refresh-token-fetch.error';
import { RefreshToken } from '../../domain/entities/refresh-token.entity';
import type { RefreshTokenRepository } from '../../domain/repositories/refresh-token.repository';
import type { RefreshTokenGenerator } from '../../domain/ports/refresh-token-generator.port';
import type { TransactionRunner } from '@shared/transaction/transaction-runner.port';
import type { AuditLogger } from '@modules/audit/application/ports/audit-logger.port';
import { AUDIT_ACTIONS } from '@modules/audit/domain/audit-actions';

const HOUR_MS = 60 * 60 * 1000;

class InMemoryRefreshTokenRepository implements RefreshTokenRepository {
  readonly tokens = new Map<string, RefreshToken>();

  seed(token: RefreshToken): void {
    this.tokens.set(token.id, token);
  }

  findByTokenHash(tokenHash: string): Promise<RefreshToken | null> {
    for (const token of this.tokens.values()) {
      if (token.tokenHash === tokenHash) {
        return Promise.resolve(token);
      }
    }
    return Promise.resolve(null);
  }

  save(token: RefreshToken): Promise<void> {
    this.tokens.set(token.id, token);
    return Promise.resolve();
  }

  revoke(id: string, replacedById: string | null): Promise<number> {
    const token = this.tokens.get(id);
    if (!token || token.isRevoked()) {
      return Promise.resolve(0);
    }
    this.tokens.set(id, this.withRevocation(token, replacedById));
    return Promise.resolve(1);
  }

  revokeChainFrom(tokenId: string): Promise<void> {
    let currentId: string | null = tokenId;
    while (currentId !== null) {
      const token: RefreshToken | undefined = this.tokens.get(currentId);
      if (!token) {
        break;
      }
      if (!token.isRevoked()) {
        this.tokens.set(currentId, this.withRevocation(token, token.replacedById));
      }
      currentId = token.replacedById;
    }
    return Promise.resolve();
  }

  private withRevocation(token: RefreshToken, replacedById: string | null) {
    return RefreshToken.fromPersistence({
      id: token.id,
      userId: token.userId,
      tokenHash: token.tokenHash,
      expiresAt: token.expiresAt,
      revokedAt: new Date(),
      replacedById,
      createdAt: token.createdAt,
    });
  }
}

class FakeRefreshTokenGenerator implements RefreshTokenGenerator {
  generate() {
    return { token: 'plain', tokenHash: this.hash('plain') };
  }

  hash(token: string): string {
    return `hash:${token}`;
  }
}

describe('LogoutUseCase', () => {
  let repo: InMemoryRefreshTokenRepository;
  let generator: FakeRefreshTokenGenerator;
  let auditLog: jest.MockedFunction<AuditLogger['log']>;
  let useCase: LogoutUseCase;

  const transactions: TransactionRunner = {
    run: <T>(work: (tx: unknown) => Promise<T>) => work({}),
  };

  beforeEach(() => {
    repo = new InMemoryRefreshTokenRepository();
    generator = new FakeRefreshTokenGenerator();
    auditLog = jest.fn() as jest.MockedFunction<AuditLogger['log']>;
    const auditLogger: AuditLogger = { log: auditLog };

    useCase = new LogoutUseCase(repo, generator, transactions, auditLogger);
  });

  it('revokes the presented token and audits LOGOUT', async () => {
    const token = RefreshToken.issue({
      userId: 'user-1',
      tokenHash: generator.hash('session'),
      ttlMs: HOUR_MS,
    });
    repo.seed(token);

    await useCase.execute('session');

    expect(repo.tokens.get(token.id)!.isRevoked()).toBe(true);
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        action: AUDIT_ACTIONS.LOGOUT,
        entity: 'RefreshToken',
        entityId: token.id,
      }),
    );
  });

  it('revokes the whole rotation family from the presented token', async () => {
    const leaf = RefreshToken.issue({
      userId: 'user-1',
      tokenHash: generator.hash('leaf'),
      ttlMs: HOUR_MS,
    });
    const head = RefreshToken.fromPersistence({
      id: 'head-1',
      userId: 'user-1',
      tokenHash: generator.hash('head'),
      expiresAt: new Date(Date.now() + HOUR_MS),
      revokedAt: null,
      replacedById: leaf.id,
      createdAt: new Date(),
    });
    repo.seed(leaf);
    repo.seed(head);

    await useCase.execute('head');

    expect(repo.tokens.get('head-1')!.isRevoked()).toBe(true);
    expect(repo.tokens.get(leaf.id)!.isRevoked()).toBe(true);
  });

  it('is idempotent: an unknown token is a no-op, no error, no audit', async () => {
    await expect(useCase.execute('never-issued')).resolves.toBeUndefined();
    expect(auditLog).not.toHaveBeenCalled();
  });

  it('wraps a repository read failure in RefreshTokenFetchError with cause', async () => {
    const dbError = new Error('DB down');
    jest.spyOn(repo, 'findByTokenHash').mockRejectedValue(dbError);

    await expect(useCase.execute('whatever')).rejects.toBeInstanceOf(RefreshTokenFetchError);
    await expect(useCase.execute('whatever')).rejects.toMatchObject({ cause: dbError });
  });
});
