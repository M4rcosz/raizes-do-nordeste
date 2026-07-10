import { jest } from '@jest/globals';
import { Prisma } from '@prisma/client';

/**
 * Test support for the Prisma repository specs. Prisma is an across-process
 * boundary, so mocking its delegates is the sanctioned move (CLAUDE.md reserves
 * "fakes not mocks" for code we own).
 *
 * This is not a generic helpers.ts: it holds exactly the three primitives every
 * repo spec needs to stand a delegate up and read back the args the repo passed.
 */

/**
 * One Prisma delegate method. `unknown` args/return keep the cast light while
 * letting mockResolvedValue accept the raw Prisma rows.
 */
export type DelegateFn = jest.MockedFunction<(args?: unknown) => Promise<unknown>>;

export const delegateFn = (): DelegateFn => jest.fn() as DelegateFn;

/** The shape of the argument object a repo hands to a delegate. */
export type PrismaArgs = {
  where?: Record<string, unknown>;
  data?: Record<string, unknown>;
} & Record<string, unknown>;

/** Read back the argument object the repo passed on the nth call. */
export const argsOf = (fn: DelegateFn, call = 0): PrismaArgs =>
  fn.mock.calls[call][0] as PrismaArgs;

/**
 * Build a PrismaClientKnownRequestError for the error-translation tests.
 * clientVersion is read from the installed client rather than hardcoded, so a
 * Prisma upgrade cannot leave a stale version string behind in a dozen specs.
 */
export const knownRequestError = (
  code: string,
  meta?: Record<string, unknown>,
): Prisma.PrismaClientKnownRequestError =>
  new Prisma.PrismaClientKnownRequestError(`Prisma error ${code}`, {
    code,
    clientVersion: Prisma.prismaVersion.client,
    ...(meta && { meta }),
  });
