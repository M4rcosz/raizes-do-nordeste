import { describe, expect, it } from '@jest/globals';
import { ApplicationError } from '@shared/errors/application/application.error';
import { ERROR_KINDS } from '@shared/errors/errors.type';
import {
  createTimestampKeysetCodec,
  decodeCursorPayload,
  encodeCursorPayload,
  isTimestampKeysetCursor,
} from './keyset-cursor';

class TestCursorError extends ApplicationError {
  constructor(message: string, options?: { cause?: unknown }) {
    super(ERROR_KINDS.INVALID, message, options);
  }
}

const AT = new Date('2026-03-04T05:06:07.008Z');

describe('keyset-cursor', () => {
  describe('createTimestampKeysetCodec', () => {
    const codec = createTimestampKeysetCodec(TestCursorError);

    it('round-trips a timestamp and id', () => {
      const token = codec.encode(AT, 'row-1');

      expect(codec.decode(token)).toEqual({ timestamp: AT, id: 'row-1' });
    });

    it('decodes the timestamp back to the same instant, not the wire string', () => {
      const decoded = codec.decode(codec.encode(AT, 'row-1'));

      // The repository compares against a column, so it needs a Date. Millisecond
      // precision has to survive: truncating it would re-include the boundary row.
      expect(decoded.timestamp).toBeInstanceOf(Date);
      expect(decoded.timestamp.getTime()).toBe(AT.getTime());
    });

    it('produces a token that does not read as the raw values', () => {
      const token = codec.encode(AT, 'row-1');

      expect(token).not.toContain('row-1');
      expect(token).not.toContain(AT.toISOString());
    });

    it('rejects a token that is not base64url JSON', () => {
      expect(() => codec.decode('not-a-token')).toThrow(TestCursorError);
    });

    it('rejects a token whose payload is not an object', () => {
      expect(() => codec.decode(encodeCursorPayload(['nope'] as unknown as object))).toThrow(
        TestCursorError,
      );
    });

    it('rejects a payload missing the id', () => {
      expect(() => codec.decode(encodeCursorPayload({ timestamp: AT.toISOString() }))).toThrow(
        TestCursorError,
      );
    });

    it('rejects an empty id', () => {
      expect(() =>
        codec.decode(encodeCursorPayload({ timestamp: AT.toISOString(), id: '' })),
      ).toThrow(TestCursorError);
    });

    it('rejects an unparseable timestamp instead of returning an empty page', () => {
      // The reason the guard exists. new Date('later') is an Invalid Date, which
      // compares false against every column value, so the keyset would match nothing
      // and the caller would read a silent empty page as "end of results".
      expect(() => codec.decode(encodeCursorPayload({ timestamp: 'later', id: 'row-1' }))).toThrow(
        TestCursorError,
      );
    });

    it('rejects an id carrying a NUL byte instead of 500ing at the driver', () => {
      // Passes a bare `typeof === 'string'` check, but Postgres text cannot hold a NUL,
      // so without this guard an attacker-chosen token becomes a 500 on a public route.
      expect(() =>
        codec.decode(encodeCursorPayload({ timestamp: AT.toISOString(), id: 'a\u0000b' })),
      ).toThrow(TestCursorError);
    });

    it('rejects an absurdly long id', () => {
      expect(() =>
        codec.decode(encodeCursorPayload({ timestamp: AT.toISOString(), id: 'x'.repeat(200) })),
      ).toThrow(TestCursorError);
    });

    it('rejects an instant outside what the database can hold', () => {
      // A valid JS Date, far outside the Postgres timestamp range.
      expect(() =>
        codec.decode(encodeCursorPayload({ timestamp: '-271821-04-20T00:00:00.000Z', id: 'r' })),
      ).toThrow(TestCursorError);
      expect(() =>
        codec.decode(encodeCursorPayload({ timestamp: '+275760-09-13T00:00:00.000Z', id: 'r' })),
      ).toThrow(TestCursorError);
    });

    it('still accepts ordinary row timestamps', () => {
      for (const iso of ['2020-01-01T00:00:00.000Z', '2026-07-21T23:59:59.999Z']) {
        expect(codec.decode(codec.encode(new Date(iso), 'r')).timestamp.toISOString()).toBe(iso);
      }
    });

    it('throws the context error it was built with', () => {
      class OtherCursorError extends ApplicationError {
        constructor(message: string, options?: { cause?: unknown }) {
          super(ERROR_KINDS.INVALID, message, options);
        }
      }
      const otherCodec = createTimestampKeysetCodec(OtherCursorError);

      expect(() => otherCodec.decode('garbage')).toThrow(OtherCursorError);
      expect(() => otherCodec.decode('garbage')).not.toThrow(TestCursorError);
    });

    it('chains the parse failure as the cause', () => {
      expect.assertions(1);
      try {
        codec.decode('garbage');
      } catch (err) {
        expect((err as TestCursorError).cause).toBeDefined();
      }
    });
  });

  describe('isTimestampKeysetCursor', () => {
    it.each([
      ['null', null],
      ['a string', 'nope'],
      ['a number', 7],
      ['a missing timestamp', { id: 'row-1' }],
      ['a non-string timestamp', { timestamp: 1, id: 'row-1' }],
      ['a non-string id', { timestamp: AT.toISOString(), id: 1 }],
    ])('rejects %s', (_label, value) => {
      expect(isTimestampKeysetCursor(value)).toBe(false);
    });

    it('accepts a well-formed payload', () => {
      expect(isTimestampKeysetCursor({ timestamp: AT.toISOString(), id: 'row-1' })).toBe(true);
    });
  });

  describe('decodeCursorPayload', () => {
    it('narrows with the caller-supplied guard', () => {
      const isPair = (value: unknown): value is { a: number } =>
        typeof value === 'object' &&
        value !== null &&
        typeof (value as { a: unknown }).a === 'number';

      expect(decodeCursorPayload(encodeCursorPayload({ a: 1 }), isPair, TestCursorError)).toEqual({
        a: 1,
      });
      expect(() =>
        decodeCursorPayload(encodeCursorPayload({ a: 'x' }), isPair, TestCursorError),
      ).toThrow(TestCursorError);
    });
  });
});
