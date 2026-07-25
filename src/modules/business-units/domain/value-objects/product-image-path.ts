import { InvalidProductImagePathError } from '../errors/invalid-product-image-path.error';

/** Image content types the product catalog accepts. */
export const PRODUCT_IMAGE_CONTENT_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

export type ProductImageContentType = (typeof PRODUCT_IMAGE_CONTENT_TYPES)[number];

// Typed as a total Record so adding a content type above fails to compile until
// its extension is declared here. The path grammar below must stay in sync.
const EXTENSION_BY_CONTENT_TYPE: Record<ProductImageContentType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

const UUID_V4 = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const EXTENSIONS = 'png|jpg|webp';

// A uuid route param cannot contain a regex metacharacter, but the anchor is the
// whole security property here, so never interpolate an id we did not escape.
function escapeRegExp(raw: string): string {
  return raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Storage object path for a product image: `products/<productId>/<uuid-v4>.<ext>`.
 *
 * No client-supplied filename ever enters the path - the whole traversal surface
 * is closed by construction. The random segment is PASSED IN rather than drawn
 * inside, so the value object stays pure and tests are deterministic; the use
 * case supplies randomUUID().
 */
export class ProductImagePath {
  private constructor(
    public readonly value: string,
    public readonly productId: string,
  ) {}

  /** Builds a fresh path. `token` must be a uuid v4 (the object's random name). */
  static mint(
    productId: string,
    contentType: ProductImageContentType,
    token: string,
  ): ProductImagePath {
    // @IsUUID() accepts an uppercase uuid and Postgres resolves the same row, but
    // the grammar below is lowercase hex only. Without this a request under an
    // uppercase route param would write to a second folder for the same product,
    // which the confirm step could never find again.
    const id = productId.toLowerCase();
    const extension = EXTENSION_BY_CONTENT_TYPE[contentType];
    // Re-parsed rather than trusted: mint can then never emit a path that the
    // confirm step would reject.
    return ProductImagePath.parse(`products/${id}/${token}.${extension}`, id);
  }

  /**
   * Re-validates an untrusted path against `productId`. The regex is anchored on
   * that id, so a well-formed path belonging to another product is rejected just
   * like a malformed one.
   */
  static parse(raw: string, productId: string): ProductImagePath {
    // Only the id is normalized. `raw` is attacker-controlled and is matched
    // exactly as received: lowercasing it first would change the grammar the
    // anchor enforces, and that anchor is the whole security property.
    const id = productId.toLowerCase();
    const pattern = new RegExp(`^products/${escapeRegExp(id)}/${UUID_V4}\\.(?:${EXTENSIONS})$`);

    if (!pattern.test(raw)) {
      // The rejected value is never echoed back: it is attacker-controlled input.
      throw new InvalidProductImagePathError(
        `Image path is not a valid object path for product "${id}".`,
      );
    }

    return new ProductImagePath(raw, id);
  }

  toString(): string {
    return this.value;
  }
}
