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
  it('round-trips the row id and the sort it was minted under', () => {
    const token = encodeOrderCursor('o-1', {
      field: OrderSortField.TOTAL_AMOUNT,
      direction: SortDirection.ASC,
    });

    expect(decodeOrderCursor(token)).toEqual({
      sortBy: OrderSortField.TOTAL_AMOUNT,
      sortDir: SortDirection.ASC,
      id: 'o-1',
    });
  });

  it('produces a token that is not the bare id (opaque to the client)', () => {
    const token = encodeOrderCursor('o-1', DEFAULT_ORDER_SORT);

    expect(token).not.toBe('o-1');
    // base64url alphabet only: safe to hand back in a query string unescaped.
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('rejects a tampered token whose payload no longer decodes to JSON', () => {
    const token = `${encodeOrderCursor('o-1', DEFAULT_ORDER_SORT)}corrupted`;

    expect(() => decodeOrderCursor(token)).toThrow(InvalidOrderCursorError);
  });

  it('rejects a non-JSON payload', () => {
    expect(() => decodeOrderCursor(Buffer.from('not json', 'utf8').toString('base64url'))).toThrow(
      InvalidOrderCursorError,
    );
  });

  it('rejects JSON carrying a sort field outside the allowlist', () => {
    const token = encodePayload({ sortBy: 'notes', sortDir: 'desc', id: 'o-1' });

    expect(() => decodeOrderCursor(token)).toThrow(InvalidOrderCursorError);
  });

  it('rejects JSON carrying an unknown sort direction', () => {
    const token = encodePayload({ sortBy: 'createdAt', sortDir: 'sideways', id: 'o-1' });

    expect(() => decodeOrderCursor(token)).toThrow(InvalidOrderCursorError);
  });

  it('rejects a payload with a missing or empty id', () => {
    expect(() =>
      decodeOrderCursor(encodePayload({ sortBy: 'createdAt', sortDir: 'desc' })),
    ).toThrow(InvalidOrderCursorError);
    expect(() =>
      decodeOrderCursor(encodePayload({ sortBy: 'createdAt', sortDir: 'desc', id: '' })),
    ).toThrow(InvalidOrderCursorError);
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
