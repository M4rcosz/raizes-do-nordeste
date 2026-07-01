import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ExpireIdempotencyKeysUseCase } from './expire-idempotency-keys.use-case';
import type { IdempotencyStore } from '../ports/idempotency-store.port';

describe('ExpireIdempotencyKeysUseCase', () => {
  let deleteExpired: jest.MockedFunction<IdempotencyStore['deleteExpired']>;
  let useCase: ExpireIdempotencyKeysUseCase;

  beforeEach(() => {
    deleteExpired = jest.fn() as jest.MockedFunction<IdempotencyStore['deleteExpired']>;
    const store = {
      find: jest.fn() as jest.MockedFunction<IdempotencyStore['find']>,
      record: jest.fn() as jest.MockedFunction<IdempotencyStore['record']>,
      deleteExpired,
    } satisfies IdempotencyStore;
    useCase = new ExpireIdempotencyKeysUseCase(store);
  });

  it('delegates to the store with the given clock and returns the count', async () => {
    deleteExpired.mockResolvedValue(5);
    const now = new Date('2026-06-29T12:00:00.000Z');

    await expect(useCase.execute(now)).resolves.toBe(5);
    expect(deleteExpired).toHaveBeenCalledWith(now);
  });

  it('defaults to the current time when no clock is supplied', async () => {
    deleteExpired.mockResolvedValue(0);

    await useCase.execute();

    expect(deleteExpired).toHaveBeenCalledTimes(1);
    expect(deleteExpired.mock.calls[0][0]).toBeInstanceOf(Date);
  });
});
