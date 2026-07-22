import { describe, expect, it } from '@jest/globals';
import {
  DEFAULT_ORDER_SORT,
  OrderSortField,
  SortDirection,
} from '../domain/value-objects/order-sort';
import { decodeOrderCursor, encodeOrderCursor } from './list-orders-cursor';
import { InvalidOrderCursorError } from './errors/invalid-order-cursor.error';

const encodePayload = (payload: unknown): string =>
  Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');

describe('order cursor codec', () => {
  it('round-trips the full sort key and the sort it was minted under', () => {
    const token = encodeOrderCursor('o-1', '42.50', {
      field: OrderSortField.TOTAL_AMOUNT,
      direction: SortDirection.ASC,
    });

    expect(decodeOrderCursor(token)).toEqual({
      sortBy: OrderSortField.TOTAL_AMOUNT,
      sortDir: SortDirection.ASC,
      sortValue: '42.50',
      id: 'o-1',
    });
  });

  it('carries the sort VALUE, not just the id: that is what makes it a keyset', () => {
    // Without sortValue the query can only seek to a row, which is the positional
    // cursor that drops a row when the row it names stops matching the filters.
    const token = encodeOrderCursor('o-1', '2026-07-19T10:00:00.000Z', DEFAULT_ORDER_SORT);

    expect(decodeOrderCursor(token).sortValue).toBe('2026-07-19T10:00:00.000Z');
  });

  it('produces a token that is not the bare id (opaque to the client)', () => {
    const token = encodeOrderCursor('o-1', '2026-07-19T10:00:00.000Z', DEFAULT_ORDER_SORT);

    expect(token).not.toBe('o-1');
    // base64url alphabet only: safe to hand back in a query string unescaped.
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('rejects a tampered token whose payload no longer decodes to JSON', () => {
    const token = `${encodeOrderCursor('o-1', '2026-07-19T10:00:00.000Z', DEFAULT_ORDER_SORT)}corrupted`;

    expect(() => decodeOrderCursor(token)).toThrow(InvalidOrderCursorError);
  });

  it('rejects a non-JSON payload', () => {
    expect(() => decodeOrderCursor(Buffer.from('not json', 'utf8').toString('base64url'))).toThrow(
      InvalidOrderCursorError,
    );
  });

  it('rejects JSON carrying a sort field outside the allowlist', () => {
    const token = encodePayload({
      sortBy: 'notes',
      sortDir: 'desc',
      sortValue: '2026-07-19T10:00:00.000Z',
      id: 'o-1',
    });

    expect(() => decodeOrderCursor(token)).toThrow(InvalidOrderCursorError);
  });

  it('rejects JSON carrying an unknown sort direction', () => {
    const token = encodePayload({
      sortBy: 'createdAt',
      sortDir: 'sideways',
      sortValue: '2026-07-19T10:00:00.000Z',
      id: 'o-1',
    });

    expect(() => decodeOrderCursor(token)).toThrow(InvalidOrderCursorError);
  });

  it('rejects a payload with a missing or empty id', () => {
    const base = { sortBy: 'createdAt', sortDir: 'desc', sortValue: '2026-07-19T10:00:00.000Z' };
    expect(() => decodeOrderCursor(encodePayload(base))).toThrow(InvalidOrderCursorError);
    expect(() => decodeOrderCursor(encodePayload({ ...base, id: '' }))).toThrow(
      InvalidOrderCursorError,
    );
  });

  it('rejects a payload with a missing or empty sortValue', () => {
    const base = { sortBy: 'createdAt', sortDir: 'desc', id: 'o-1' };
    expect(() => decodeOrderCursor(encodePayload(base))).toThrow(InvalidOrderCursorError);
    expect(() => decodeOrderCursor(encodePayload({ ...base, sortValue: '' }))).toThrow(
      InvalidOrderCursorError,
    );
  });

  it('rejects a createdAt sortValue that is not a readable instant', () => {
    // An unparseable date would become an Invalid Date in the keyset comparison, which
    // compares false against every row and silently returns an empty page.
    const token = encodePayload({
      sortBy: 'createdAt',
      sortDir: 'desc',
      sortValue: 'yesterday-ish',
      id: 'o-1',
    });

    expect(() => decodeOrderCursor(token)).toThrow(InvalidOrderCursorError);
  });

  it('rejects a totalAmount sortValue that is not a 2dp decimal string', () => {
    const bad = ['12.345', 'NaN', '1e5', '-5.00', ''];
    for (const sortValue of bad) {
      const token = encodePayload({
        sortBy: 'totalAmount',
        sortDir: 'asc',
        sortValue,
        id: 'o-1',
      });
      expect(() => decodeOrderCursor(token)).toThrow(InvalidOrderCursorError);
    }
  });

  it('accepts a well-formed totalAmount sortValue', () => {
    const token = encodePayload({
      sortBy: 'totalAmount',
      sortDir: 'asc',
      sortValue: '0.00',
      id: 'o-1',
    });

    expect(decodeOrderCursor(token).sortValue).toBe('0.00');
  });

  it('rejects a JSON payload that is not an object', () => {
    expect(() => decodeOrderCursor(encodePayload('o-1'))).toThrow(InvalidOrderCursorError);
    expect(() => decodeOrderCursor(encodePayload(null))).toThrow(InvalidOrderCursorError);
  });

  it('chains the underlying parse failure as the cause', () => {
    try {
      decodeOrderCursor('!!!not-base64!!!');
      throw new Error('expected decodeOrderCursor to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidOrderCursorError);
      expect((err as InvalidOrderCursorError).cause).toBeInstanceOf(Error);
    }
  });
});
