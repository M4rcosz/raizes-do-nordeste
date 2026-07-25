import {
  PRODUCT_IMAGE_CONTENT_TYPES,
  type ProductImageContentType,
} from '../../domain/value-objects/product-image-path';

export const PRODUCT_IMAGE_STORAGE = Symbol('ProductImageStorage');

// Re-exported from the value object rather than re-declared: the allowlist and
// the contentType -> extension map are the same rule, and two copies of it would
// drift the day a format is added.
export { PRODUCT_IMAGE_CONTENT_TYPES, type ProductImageContentType };

export interface SignedUpload {
  signedUrl: string;
  token: string;
  path: string;
  expiresInSeconds: number;
}

export interface StoredObjectInfo {
  sizeBytes: number;
  /** As stored by the bucket, NOT as claimed by our code. */
  contentType: string;
}

/**
 * Object storage for product images. No vendor type crosses this boundary.
 *
 * `maxBytes` is deliberately absent: the size policy is an application rule, the
 * port only reports what it actually found in the bucket.
 */
export interface ProductImageStorage {
  createSignedUpload(path: string): Promise<SignedUpload>;
  /** Metadata of the object at `path`, or null when nothing is there. */
  head(path: string): Promise<StoredObjectInfo | null>;
  /** Permanent public CDN URL for `path`. Pure string building, no I/O. */
  publicUrl(path: string): string;
  /** Best-effort delete. Resolves (does not throw) when the object is already gone. */
  remove(path: string): Promise<void>;
}
