import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { RefreshTokenUseCase } from './refresh-token.use-case';
import { InvalidRefreshTokenError } from '../errors/invalid-refresh-token.error';
import { RefreshTokenFetchError } from '../errors/refresh-token-fetch.error';
import { UsersFetchError } from '../errors/users-fetch.error';
import { RefreshToken } from '../../domain/entities/refresh-token.entity';
import type { RefreshTokenRepository } from '../../domain/repositories/refresh-token.repository';
import type { RefreshTokenGenerator } from '../../domain/ports/refresh-token-generator.port';
import type { UserRepository } from '../../domain/repositories/user.repository';
import type { TokenSigner } from '../../domain/ports/token-signer.port';
import type { TransactionRunner } from '@shared/transaction/transaction-runner.port';
import type { AuditLogger } from '@modules/audit/application/ports/audit-logger.port';
import { AUDIT_ACTIONS } from '@modules/audit/domain/audit-actions';
import { User } from '../../domain/entities/user.entity';

const HOUR_MS = 60 * 60 * 1000;

// A minimal transaction context the fake repo and runner agree on: an undo log
// the runner replays on rollback. This lets the fake model real Prisma
// transaction semantics (a thrown tx rolls back its own writes) so the
// concurrency test exercises the guarded rotation for real, not against a mock.
interface FakeTx {
  undo: Array<() => void>;
}

const isFakeTx = (tx: unknown): tx is FakeTx =>
  typeof tx === 'object' && tx !== null && Array.isArray((tx as { undo?: unknown }).undo);

// In-memory fake. Mirrors the rotation/chain semantics the real Prisma repo
// implements (conditional revoke + per-tx rollback) so the use case is
// exercised against real behavior, not a mock.
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

  save(token: RefreshToken, tx?: unknown): Promise<void> {
    const prior = this.tokens.get(token.id);
    this.tokens.set(token.id, token);
    if (isFakeTx(tx)) {
      tx.undo.push(() =>
        prior === undefined ? this.tokens.delete(token.id) : this.tokens.set(token.id, prior),
      );
    }
    return Promise.resolve();
  }

  // Conditional: only flips a still-active token. Returns rows changed (0 or 1),
  // so a concurrent second rotation of the same token reports 0.
  revoke(id: string, replacedById: string | null, tx?: unknown): Promise<number> {
    const token = this.tokens.get(id);
    if (!token || token.isRevoked()) {
      return Promise.resolve(0);
    }
    this.tokens.set(id, this.withRevocation(token, new Date(), replacedById));
    if (isFakeTx(tx)) {
      tx.undo.push(() => this.tokens.set(id, token));
    }
    return Promise.resolve(1);
  }

  revokeChainFrom(tokenId: string): Promise<void> {
    let currentId: string | null = tokenId;
    const now = new Date();
    while (currentId !== null) {
      const token: RefreshToken | undefined = this.tokens.get(currentId);
      if (!token) {
        break;
      }
      if (!token.isRevoked()) {
        this.tokens.set(currentId, this.withRevocation(token, now, token.replacedById));
      }
      currentId = token.replacedById;
    }
    return Promise.resolve();
  }

  private withRevocation(token: RefreshToken, revokedAt: Date, replacedById: string | null) {
    return RefreshToken.fromPersistence({
      id: token.id,
      userId: token.userId,
      tokenHash: token.tokenHash,
      expiresAt: token.expiresAt,
      revokedAt,
      replacedById,
      createdAt: token.createdAt,
    });
  }
}

class FakeRefreshTokenGenerator implements RefreshTokenGenerator {
  private counter = 0;

  generate() {
    this.counter += 1;
    const token = `plain-${this.counter}`;
    return { token, tokenHash: this.hash(token) };
  }

  hash(token: string): string {
    return `hash:${token}`;
  }
}

const buildUser = (overrides?: { id?: string; isActive?: boolean }): User =>
  new User(
    overrides?.id ?? 'user-1',
    'bu-1',
    'panic',
    'Pedro Panic',
    'panic@example.com',
    'real-hash',
    null,
    new Date('2026-01-01T00:00:00Z'),
    new Date('2026-01-02T00:00:00Z'),
    null,
    'KITCHEN',
    overrides?.isActive ?? true,
  );

describe('RefreshTokenUseCase', () => {
  let repo: InMemoryRefreshTokenRepository;
  let generator: FakeRefreshTokenGenerator;
  let findById: jest.MockedFunction<UserRepository['findById']>;
  let sign: jest.MockedFunction<TokenSigner['sign']>;
  let auditLog: jest.MockedFunction<AuditLogger['log']>;
  let useCase: RefreshTokenUseCase;

  // Runs work against a fresh undo log; on throw, replays the log (rollback)
  // then rethrows, mirroring a real DB transaction.
  const transactions: TransactionRunner = {
    run: async <T>(work: (tx: unknown) => Promise<T>): Promise<T> => {
      const tx: FakeTx = { undo: [] };
      try {
        return await work(tx);
      } catch (err) {
        for (const undo of tx.undo.reverse()) {
          undo();
        }
        throw err;
      }
    },
  };

  beforeEach(() => {
    repo = new InMemoryRefreshTokenRepository();
    generator = new FakeRefreshTokenGenerator();
    findById = jest.fn() as jest.MockedFunction<UserRepository['findById']>;
    sign = jest.fn() as jest.MockedFunction<TokenSigner['sign']>;
    auditLog = jest.fn() as jest.MockedFunction<AuditLogger['log']>;

    const users = { findById } as unknown as UserRepository;
    const tokenSigner: TokenSigner = { sign };
    const auditLogger: AuditLogger = { log: auditLog };

    useCase = new RefreshTokenUseCase(
      repo,
      generator,
      users,
      tokenSigner,
      transactions,
      HOUR_MS,
      auditLogger,
    );
  });

  // Seeds an active token whose plaintext is `plain` and returns that plaintext.
  const seedActiveToken = (userId = 'user-1', plain = 'seed'): { plain: string; id: string } => {
    const token = RefreshToken.issue({
      userId,
      tokenHash: generator.hash(plain),
      ttlMs: HOUR_MS,
    });
    repo.seed(token);
    return { plain, id: token.id };
  };

  describe('happy path', () => {
    it('rotates: revokes the old token, persists a new active one, and returns a new pair', async () => {
      const { plain, id: oldId } = seedActiveToken();
      findById.mockResolvedValue(buildUser());
      sign.mockResolvedValue('access.jwt');

      const result = await useCase.execute(plain);

      expect(result.access_token).toBe('access.jwt');
      expect(result.refresh_token).toBe('plain-1');

      const oldToken = repo.tokens.get(oldId)!;
      expect(oldToken.isRevoked()).toBe(true);
      expect(oldToken.replacedById).not.toBeNull();

      const newToken = repo.tokens.get(oldToken.replacedById!)!;
      expect(newToken.isRevoked()).toBe(false);
      expect(newToken.tokenHash).toBe(generator.hash('plain-1'));
    });

    it('re-emits the JWT payload as { sub, username, role }', async () => {
      const { plain } = seedActiveToken();
      findById.mockResolvedValue(buildUser({ id: 'user-1' }));
      sign.mockResolvedValue('access.jwt');

      await useCase.execute(plain);

      expect(sign).toHaveBeenCalledWith({ sub: 'user-1', username: 'panic', role: 'KITCHEN' });
    });

    it('audits TOKEN_REFRESHED', async () => {
      const { plain } = seedActiveToken();
      findById.mockResolvedValue(buildUser());
      sign.mockResolvedValue('access.jwt');

      await useCase.execute(plain);

      expect(auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          action: AUDIT_ACTIONS.TOKEN_REFRESHED,
          entity: 'RefreshToken',
        }),
      );
    });
  });

  describe('rejection paths (all map to InvalidRefreshTokenError)', () => {
    it('rejects an unknown token', async () => {
      await expect(useCase.execute('does-not-exist')).rejects.toBeInstanceOf(
        InvalidRefreshTokenError,
      );
      expect(sign).not.toHaveBeenCalled();
    });

    it('rejects an expired token without rotating', async () => {
      const expired = RefreshToken.fromPersistence({
        id: 'exp-1',
        userId: 'user-1',
        tokenHash: generator.hash('expired'),
        expiresAt: new Date(Date.now() - HOUR_MS),
        revokedAt: null,
        replacedById: null,
        createdAt: new Date(Date.now() - 2 * HOUR_MS),
      });
      repo.seed(expired);

      await expect(useCase.execute('expired')).rejects.toBeInstanceOf(InvalidRefreshTokenError);
      expect(sign).not.toHaveBeenCalled();
      expect(repo.tokens.get('exp-1')!.isRevoked()).toBe(false);
    });

    it('rejects a deactivated user without rotating', async () => {
      const { plain, id } = seedActiveToken();
      findById.mockResolvedValue(buildUser({ isActive: false }));

      await expect(useCase.execute(plain)).rejects.toBeInstanceOf(InvalidRefreshTokenError);
      expect(sign).not.toHaveBeenCalled();
      expect(repo.tokens.get(id)!.isRevoked()).toBe(false);
    });

    it('rejects when the user no longer exists', async () => {
      const { plain } = seedActiveToken();
      findById.mockResolvedValue(null);

      await expect(useCase.execute(plain)).rejects.toBeInstanceOf(InvalidRefreshTokenError);
      expect(sign).not.toHaveBeenCalled();
    });
  });

  describe('reuse detection', () => {
    it('on a revoked token, revokes the whole rotation family, audits, and rejects', async () => {
      // Build a chain: A (revoked) -> B (active leaf). Presenting A is reuse.
      const leaf = RefreshToken.issue({
        userId: 'user-1',
        tokenHash: generator.hash('leaf'),
        ttlMs: HOUR_MS,
      });
      const reused = RefreshToken.fromPersistence({
        id: 'reused-1',
        userId: 'user-1',
        tokenHash: generator.hash('reused'),
        expiresAt: new Date(Date.now() + HOUR_MS),
        revokedAt: new Date(),
        replacedById: leaf.id,
        createdAt: new Date(),
      });
      repo.seed(leaf);
      repo.seed(reused);

      await expect(useCase.execute('reused')).rejects.toBeInstanceOf(InvalidRefreshTokenError);

      // The still-active descendant must be killed too.
      expect(repo.tokens.get(leaf.id)!.isRevoked()).toBe(true);
      expect(auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          action: AUDIT_ACTIONS.TOKEN_REUSE_DETECTED,
          entity: 'RefreshToken',
        }),
      );
      expect(sign).not.toHaveBeenCalled();
    });
  });

  describe('concurrency (guarded rotation)', () => {
    it('serializes two parallel rotations of the same token: one wins, one is rejected, no fork', async () => {
      const { plain, id: oldId } = seedActiveToken();
      findById.mockResolvedValue(buildUser());
      sign.mockResolvedValue('access.jwt');

      const results = await Promise.allSettled([useCase.execute(plain), useCase.execute(plain)]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toBeInstanceOf(InvalidRefreshTokenError);

      // The old token is revoked and points to exactly one successor (no fork).
      const oldToken = repo.tokens.get(oldId)!;
      expect(oldToken.isRevoked()).toBe(true);
      expect(oldToken.replacedById).not.toBeNull();

      // Exactly one active token survives: the winner's new token. The loser's
      // saved token was rolled back, so the family did not fork.
      const active = [...repo.tokens.values()].filter((t) => !t.isRevoked());
      expect(active).toHaveLength(1);
      expect(active[0].id).toBe(oldToken.replacedById);
    });
  });

  describe('infrastructure failures', () => {
    it('wraps a refresh-token read failure in RefreshTokenFetchError with cause', async () => {
      const dbError = new Error('DB down');
      jest.spyOn(repo, 'findByTokenHash').mockRejectedValue(dbError);

      await expect(useCase.execute('whatever')).rejects.toBeInstanceOf(RefreshTokenFetchError);
      await expect(useCase.execute('whatever')).rejects.toMatchObject({ cause: dbError });
    });

    it('wraps a user read failure in UsersFetchError with cause', async () => {
      const { plain } = seedActiveToken();
      const dbError = new Error('user DB down');
      findById.mockRejectedValue(dbError);

      await expect(useCase.execute(plain)).rejects.toBeInstanceOf(UsersFetchError);
      expect(sign).not.toHaveBeenCalled();
    });
  });
});
