import { describe, expect, it } from '@jest/globals';
import { ERROR_KINDS } from '@shared/errors/errors.type';
import { InvalidProductImagePathError } from '../errors/invalid-product-image-path.error';
import {
  PRODUCT_IMAGE_CONTENT_TYPES,
  ProductImagePath,
  type ProductImageContentType,
} from './product-image-path';

const PRODUCT_ID = '550e8400-e29b-41d4-a716-446655440000';
const OTHER_PRODUCT_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const TOKEN = 'f81d4fae-7dec-41d0-a765-00a0c91e6bf6';

describe('ProductImagePath', () => {
  describe('mint', () => {
    const cases: [ProductImageContentType, string][] = [
      ['image/png', 'png'],
      ['image/jpeg', 'jpg'],
      ['image/webp', 'webp'],
    ];

    it.each(cases)('maps %s to the .%s extension under the product prefix', (type, extension) => {
      const path = ProductImagePath.mint(PRODUCT_ID, type, TOKEN);

      expect(path.value).toBe(`products/${PRODUCT_ID}/${TOKEN}.${extension}`);
      expect(path.productId).toBe(PRODUCT_ID);
      expect(path.toString()).toBe(path.value);
    });

    it('covers every advertised content type', () => {
      // The DTO allowlist and the extension map must not drift apart.
      for (const type of PRODUCT_IMAGE_CONTENT_TYPES) {
        expect(() => ProductImagePath.mint(PRODUCT_ID, type, TOKEN)).not.toThrow();
      }
    });

    it('is pure: the same token yields the same path', () => {
      const first = ProductImagePath.mint(PRODUCT_ID, 'image/png', TOKEN);
      const second = ProductImagePath.mint(PRODUCT_ID, 'image/png', TOKEN);

      expect(first.value).toBe(second.value);
    });

    it('refuses to emit a path the confirm step could not parse back', () => {
      expect(() => ProductImagePath.mint(PRODUCT_ID, 'image/png', '../escape')).toThrow(
        InvalidProductImagePathError,
      );
    });

    // @IsUUID() lets an uppercase id through and Postgres resolves the same row,
    // so without normalizing here one product would own two storage folders.
    it('lowercases an uppercase productId so a product owns exactly one folder', () => {
      const path = ProductImagePath.mint(PRODUCT_ID.toUpperCase(), 'image/png', TOKEN);

      expect(path.value).toBe(`products/${PRODUCT_ID}/${TOKEN}.png`);
      expect(path.productId).toBe(PRODUCT_ID);
    });
  });

  describe('parse', () => {
    it('round-trips a minted path', () => {
      const minted = ProductImagePath.mint(PRODUCT_ID, 'image/webp', TOKEN);

      const parsed = ProductImagePath.parse(minted.value, PRODUCT_ID);

      expect(parsed.value).toBe(minted.value);
      expect(parsed.productId).toBe(PRODUCT_ID);
    });

    // The IDOR surface: a perfectly well-formed path is still invalid when it
    // names another product's folder.
    const rejected: [string, string][] = [
      ['a path scoped to a different product', `products/${OTHER_PRODUCT_ID}/${TOKEN}.png`],
      [
        'a parent-directory traversal',
        `products/${PRODUCT_ID}/../${OTHER_PRODUCT_ID}/${TOKEN}.png`,
      ],
      ['a traversal spliced into the file name', `products/${PRODUCT_ID}/..%2F${TOKEN}.png`],
      ['a disallowed .svg extension', `products/${PRODUCT_ID}/${TOKEN}.svg`],
      ['a .php extension', `products/${PRODUCT_ID}/${TOKEN}.php`],
      ['a double extension', `products/${PRODUCT_ID}/${TOKEN}.png.php`],
      ['a missing extension', `products/${PRODUCT_ID}/${TOKEN}`],
      ['a bare prefix with no object', `products/${PRODUCT_ID}/`],
      ['an empty string', ''],
      ['a non-uuid object name', `products/${PRODUCT_ID}/avatar.png`],
      ['a nested sub-folder', `products/${PRODUCT_ID}/nested/${TOKEN}.png`],
      ['a trailing newline after a valid path', `products/${PRODUCT_ID}/${TOKEN}.png\n`],
    ];

    it.each(rejected)('rejects %s', (_label, raw) => {
      expect(() => ProductImagePath.parse(raw, PRODUCT_ID)).toThrow(InvalidProductImagePathError);
    });

    const parseError = (raw: string): unknown => {
      try {
        ProductImagePath.parse(raw, PRODUCT_ID);
        return null;
      } catch (err: unknown) {
        return err;
      }
    };

    it.each(rejected)('maps %s to the invalid kind (422)', (_label, raw) => {
      const error = parseError(raw);

      expect(error).toBeInstanceOf(InvalidProductImagePathError);
      expect((error as InvalidProductImagePathError).kind).toBe(ERROR_KINDS.INVALID);
    });

    it('accepts a lowercase path when the productId argument is uppercase', () => {
      const parsed = ProductImagePath.parse(
        `products/${PRODUCT_ID}/${TOKEN}.png`,
        PRODUCT_ID.toUpperCase(),
      );

      expect(parsed.value).toBe(`products/${PRODUCT_ID}/${TOKEN}.png`);
      expect(parsed.productId).toBe(PRODUCT_ID);
    });

    // Only the id argument is normalized. `raw` is attacker-controlled and stays
    // matched exactly as received, so an uppercase segment in the path itself is
    // still outside the grammar.
    it('still rejects a path whose own uuid segment is uppercase', () => {
      expect(() =>
        ProductImagePath.parse(
          `products/${PRODUCT_ID.toUpperCase()}/${TOKEN}.png`,
          PRODUCT_ID.toUpperCase(),
        ),
      ).toThrow(InvalidProductImagePathError);
    });

    it('still rejects an uppercase object token', () => {
      expect(() =>
        ProductImagePath.parse(`products/${PRODUCT_ID}/${TOKEN.toUpperCase()}.png`, PRODUCT_ID),
      ).toThrow(InvalidProductImagePathError);
    });

    it('never echoes the rejected value back in the message', () => {
      const hostile = `products/${PRODUCT_ID}/<script>.png`;

      try {
        ProductImagePath.parse(hostile, PRODUCT_ID);
        throw new Error('expected parse to reject');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(InvalidProductImagePathError);
        expect((err as Error).message).not.toContain('<script>');
      }
    });
  });
});
