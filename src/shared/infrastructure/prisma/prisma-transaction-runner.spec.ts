import { describe, expect, it, jest } from '@jest/globals';
import { PrismaTransactionRunner } from './prisma-transaction-runner';
import type { PrismaService } from '@shared/infrastructure/prisma/prisma.service';

describe('PrismaTransactionRunner', () => {
  it('runs the work inside prisma.$transaction and forwards the transaction client', async () => {
    const txClient = { marker: 'tx-client' };
    const $transaction = jest.fn((fn: (client: unknown) => Promise<unknown>) => fn(txClient));
    const prisma = { $transaction } as unknown as PrismaService;

    const runner = new PrismaTransactionRunner(prisma);

    const received: unknown[] = [];
    const result = await runner.run((tx) => {
      received.push(tx);
      return Promise.resolve('done');
    });

    expect(result).toBe('done');
    expect($transaction).toHaveBeenCalledTimes(1);
    expect(received).toEqual([txClient]);
  });

  it('propagates rejections so the transaction rolls back', async () => {
    const boom = new Error('boom');
    const $transaction = jest.fn((fn: (client: unknown) => Promise<unknown>) => fn(undefined));
    const prisma = { $transaction } as unknown as PrismaService;

    const runner = new PrismaTransactionRunner(prisma);

    await expect(runner.run(() => Promise.reject(boom))).rejects.toBe(boom);
  });
});
