import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AUDIT_LOGGER,
  type AuditLogInput,
  type AuditLogger,
} from '@modules/audit/application/ports/audit-logger.port';
import { AUDIT_ACTIONS } from '@modules/audit/domain/audit-actions';
import { Product } from '../../domain/entities/product.entity';
import {
  PRODUCT_REPOSITORY,
  type ProductRepository,
} from '../../domain/repositories/product.repository';
import {
  PRODUCT_IMAGE_CONTENT_TYPES,
  ProductImagePath,
} from '../../domain/value-objects/product-image-path';
import {
  PRODUCT_IMAGE_STORAGE,
  type ProductImageStorage,
  type StoredObjectInfo,
} from '../ports/product-image-storage.port';
import { InvalidProductImageError } from '../errors/invalid-product-image.error';
import { ProductImageNotUploadedError } from '../errors/product-image-not-uploaded.error';
import { ProductImageStorageError } from '../errors/product-image-storage.error';
import { ProductNotFoundError } from '../errors/product-not-found.error';

/**
 * Injection token for the image size cap (bytes). A plain number, not a port
 * method: how big an image may be is this application's policy, while the
 * storage only reports what it actually found.
 */
export const PRODUCT_IMAGE_MAX_BYTES = Symbol('ProductImageMaxBytes');

/** Fallback cap when SUPABASE_IMAGE_MAX_BYTES is unset. */
export const DEFAULT_PRODUCT_IMAGE_MAX_BYTES = 5_000_000;

export interface ConfirmProductImageUploadInput {
  productId: string;
  path: string;
  actorId: string;
}

/**
 * Step 2 of the two-step upload. Stateless by design: the client echoes the path
 * back and the server re-parses it against THIS product's prefix, so no upload
 * table, no sweeper and nothing to expire. Everything it trusts, it re-derives.
 */
@Injectable()
export class ConfirmProductImageUploadUseCase {
  private readonly logger = new Logger(ConfirmProductImageUploadUseCase.name);

  constructor(
    @Inject(PRODUCT_REPOSITORY)
    private readonly products: ProductRepository,
    @Inject(PRODUCT_IMAGE_STORAGE)
    private readonly storage: ProductImageStorage,
    @Inject(PRODUCT_IMAGE_MAX_BYTES)
    private readonly maxBytes: number,
    @Inject(AUDIT_LOGGER)
    private readonly auditLogger: AuditLogger,
  ) {}

  async execute(input: ConfirmProductImageUploadInput): Promise<Product> {
    const { productId, path: rawPath, actorId } = input;

    const current = await this.products.findById(productId);
    if (!current) {
      throw new ProductNotFoundError(`Product with id "${productId}" not found.`);
    }

    // Anchored on this product's id, so a well-formed path pointing at another
    // product's folder dies here, before anything is read or written.
    const path = ProductImagePath.parse(rawPath, productId);

    const info = await this.headOrThrow(path.value);
    if (!info) {
      throw new ProductImageNotUploadedError(
        `No uploaded image found for product "${productId}". Request a new upload URL and retry.`,
      );
    }
    try {
      this.assertAcceptable(info);
    } catch (err) {
      // The bytes are already in the bucket at this point and no sweeper exists,
      // so a rejected upload would sit there forever, invisible to the DB. Delete
      // it best-effort, then rethrow the original error untouched: a failed
      // cleanup must not turn a 422 into a storage error.
      await this.tryRemove(path.value);
      throw err;
    }

    const publicUrl = this.storage.publicUrl(path.value);
    const updated = await this.products.setImageUrl(productId, publicUrl);
    if (!updated) {
      throw new ProductNotFoundError(`Product with id "${productId}" not found.`);
    }

    const previousPath = this.previousObjectPath(current.imageUrl, publicUrl, path);
    if (previousPath) {
      await this.tryRemove(previousPath);
    }

    await this.tryAudit({
      userId: actorId,
      action: AUDIT_ACTIONS.PRODUCT_IMAGE_UPDATED,
      entity: 'Product',
      entityId: updated.id,
      metadata: { imagePath: path.value, replacedPrevious: previousPath !== null },
    });

    return updated;
  }

  private async headOrThrow(path: string): Promise<StoredObjectInfo | null> {
    try {
      return await this.storage.head(path);
    } catch (err) {
      throw new ProductImageStorageError(undefined, { cause: err });
    }
  }

  // Judged on what the bucket stored, never on what the mint request claimed:
  // the signed URL lets the client send any bytes it likes under any header.
  private assertAcceptable(info: StoredObjectInfo): void {
    const contentType = info.contentType.split(';')[0].trim().toLowerCase();
    const allowed: readonly string[] = PRODUCT_IMAGE_CONTENT_TYPES;
    if (!allowed.includes(contentType)) {
      throw new InvalidProductImageError(
        `Uploaded file type is not accepted. Allowed types: ${PRODUCT_IMAGE_CONTENT_TYPES.join(', ')}.`,
      );
    }

    if (info.sizeBytes <= 0) {
      throw new InvalidProductImageError('Uploaded file is empty.');
    }

    if (info.sizeBytes > this.maxBytes) {
      throw new InvalidProductImageError(
        `Uploaded file is too large. Maximum size is ${this.maxBytes} bytes.`,
      );
    }
  }

  /**
   * Recovers the object path behind an already-stored image URL, or null when
   * that URL is not ours to touch.
   *
   * publicUrl() appends the path to a fixed bucket prefix, so whatever precedes
   * the path we just built IS that prefix. A stored URL that does not start with
   * it is a legacy/external CDN link (the seed data has some) and is left alone.
   * Fails safe in both directions: worst case an object is orphaned in the
   * bucket, never a wrong delete.
   */
  private previousObjectPath(
    previousUrl: string | null,
    newUrl: string,
    newPath: ProductImagePath,
  ): string | null {
    if (!previousUrl || !newUrl.endsWith(newPath.value)) {
      return null;
    }

    const prefix = newUrl.slice(0, newUrl.length - newPath.value.length);
    if (!previousUrl.startsWith(prefix)) {
      return null;
    }

    const candidate = previousUrl.slice(prefix.length);
    if (candidate === newPath.value) {
      return null;
    }

    try {
      // Re-parsed against the same product: a tampered row can never aim the
      // delete at another product's folder.
      return ProductImagePath.parse(candidate, newPath.productId).value;
    } catch {
      return null;
    }
  }

  // Cleanup must never fail an image swap that already succeeded, nor mask the
  // rejection that triggered it.
  private async tryRemove(path: string): Promise<void> {
    try {
      await this.storage.remove(path);
    } catch (err) {
      this.logger.warn({
        message: 'Failed to remove a product image object; left orphaned in the bucket',
        path,
        cause: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Audit must never break the confirm outcome.
  private async tryAudit(input: AuditLogInput): Promise<void> {
    try {
      await this.auditLogger.log(input);
    } catch (err) {
      this.logger.warn({
        message: 'Audit logger threw during product image confirm; swallowed',
        action: input.action,
        cause: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
