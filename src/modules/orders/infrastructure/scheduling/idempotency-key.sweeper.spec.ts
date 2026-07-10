import { describe, expect, it, jest } from '@jest/globals';
import {
  IDEMPOTENCY_KEY_SWEEP_INTERVAL_MS,
  IdempotencyKeySweeper,
} from './idempotency-key.sweeper';
import { ExpireIdempotencyKeysUseCase } from '@modules/orders/application/use-cases/expire-idempotency-keys.use-case';

// The timer lifecycle and the swallow-and-log policy are covered once, in
// interval-sweeper.spec.ts. All this subclass adds is three declarations, so
// that is all this spec asserts.
type SweeperInternals = {
  sweepOnce(): Promise<number>;
  describeSweep(count: number): string;
  failureMessage: string;
};

const build = (execute: jest.MockedFunction<() => Promise<number>>): SweeperInternals =>
  new IdempotencyKeySweeper({
    execute,
  } as unknown as ExpireIdempotencyKeysUseCase) as unknown as SweeperInternals;

describe('IdempotencyKeySweeper', () => {
  it('reaps expired keys hourly', () => {
    expect(IDEMPOTENCY_KEY_SWEEP_INTERVAL_MS).toBe(60 * 60_000);
  });

  it('runs one pass by reaping expired keys', async () => {
    const execute = jest.fn<() => Promise<number>>().mockResolvedValue(12);

    await expect(build(execute).sweepOnce()).resolves.toBe(12);
    expect(execute).toHaveBeenCalledWith();
  });

  it('describes a non-empty pass', () => {
    const execute = jest.fn<() => Promise<number>>();

    expect(build(execute).describeSweep(12)).toBe('Reaped 12 expired idempotency key(s).');
  });

  it('names itself in the failure log', () => {
    const execute = jest.fn<() => Promise<number>>();

    expect(build(execute).failureMessage).toBe('Idempotency key sweep failed');
  });
});
