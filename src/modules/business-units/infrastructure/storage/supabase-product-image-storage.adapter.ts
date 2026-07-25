import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageClient, isStorageError } from '@supabase/storage-js';
import type {
  ProductImageStorage,
  SignedUpload,
  StoredObjectInfo,
} from '@modules/business-units/application/ports/product-image-storage.port';

// Supabase mints upload tokens with a fixed 2-hour life; createSignedUploadUrl
// takes no TTL argument, so this is a constant, not a knob.
const SIGNED_UPLOAD_TTL_SECONDS = 7200;

const HTTP_NOT_FOUND = 404;

// "Nothing there" is an answer, not a failure. Supabase reports it on `status`,
// but the same code also arrives as the string `statusCode`, so check both.
function isObjectMissing(error: unknown): boolean {
  if (!isStorageError(error)) {
    return false;
  }
  return error.status === HTTP_NOT_FOUND || error.statusCode === String(HTTP_NOT_FOUND);
}

/**
 * The ONLY file allowed to import @supabase/storage-js, same single-importer rule
 * as @google/genai and big.js. A pure mapper between the vendor-neutral
 * ProductImageStorage port and the Storage SDK: no Supabase type escapes upward,
 * and SDK failures propagate as-is so the use cases wrap them in
 * ProductImageStorageError.
 *
 * SUPABASE_SECRET_KEY is a server-side key that bypasses RLS project-wide. It is
 * read once here and never logged, never put in an error message, never returned.
 */
@Injectable()
export class SupabaseProductImageStorageAdapter implements ProductImageStorage {
  private readonly bucket: ReturnType<StorageClient['from']>;

  constructor(cfg: ConfigService) {
    // Fail-fast on boot: without these the image flow cannot work at all.
    const url = cfg.getOrThrow<string>('SUPABASE_URL').replace(/\/+$/, '');
    const secretKey = cfg.getOrThrow<string>('SUPABASE_SECRET_KEY');
    const bucketName = cfg.getOrThrow<string>('SUPABASE_PRODUCT_IMAGE_BUCKET');

    const client = new StorageClient(`${url}/storage/v1`, {
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`,
    });
    this.bucket = client.from(bucketName);
  }

  async createSignedUpload(path: string): Promise<SignedUpload> {
    // No { upsert: true }, deliberately: without it the token is single-use, so a
    // client cannot come back to a still-valid 2-hour signed URL and swap the
    // bytes AFTER confirm published the public CDN URL. Allowing retries here
    // would reopen that window. A retry means minting a fresh path instead.
    const { data, error } = await this.bucket.createSignedUploadUrl(path);
    if (error) {
      throw error;
    }

    return {
      signedUrl: data.signedUrl,
      token: data.token,
      path: data.path,
      expiresInSeconds: SIGNED_UPLOAD_TTL_SECONDS,
    };
  }

  async head(path: string): Promise<StoredObjectInfo | null> {
    // info() reads one object's metadata directly. The list()+search fallback is
    // not needed: this SDK version exposes it.
    const { data, error } = await this.bucket.info(path);
    if (error) {
      if (isObjectMissing(error)) {
        return null;
      }
      throw error;
    }

    return {
      sizeBytes: data.size ?? 0,
      // Empty rather than a guessed default: an unknown type must fail the
      // allowlist, not sneak past it.
      contentType: data.contentType ?? '',
    };
  }

  // getPublicUrl is pure string building (bucket prefix + path, no request), so
  // callers can reverse it by peeling the prefix off.
  publicUrl(path: string): string {
    return this.bucket.getPublicUrl(path).data.publicUrl;
  }

  async remove(path: string): Promise<void> {
    const { error } = await this.bucket.remove([path]);
    // Best-effort by contract: an object that is already gone is not a failure.
    if (error && !isObjectMissing(error)) {
      throw error;
    }
  }
}
