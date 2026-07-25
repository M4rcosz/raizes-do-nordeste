import type {
  ProductImageStorage,
  SignedUpload,
  StoredObjectInfo,
} from '@modules/business-units/application/ports/product-image-storage.port';

/** Same fixed TTL the real provider mints. */
const EXPIRES_IN_SECONDS = 7200;

const PUBLIC_URL_PREFIX = 'https://fake.storage.test/object/public/product-images/';

/**
 * In-memory ProductImageStorage. Not a mock: it really keeps a path -> metadata
 * map, so head/publicUrl/remove answer from actual state and a test that expects
 * a replaced object to be gone is checking behaviour, not a canned return.
 */
export class FakeProductImageStorage implements ProductImageStorage {
  private readonly objects = new Map<string, StoredObjectInfo>();

  readonly signedPaths: string[] = [];
  readonly removedPaths: string[] = [];

  /** Thrown by every method while set, to script a provider outage. */
  failure: Error | null = null;
  /** Thrown by remove() only, to script a cleanup that fails after a good write. */
  removeFailure: Error | null = null;

  /** Simulates the client's PUT to the signed URL. */
  putObject(path: string, info: StoredObjectInfo): this {
    this.objects.set(path, info);
    return this;
  }

  has(path: string): boolean {
    return this.objects.has(path);
  }

  get size(): number {
    return this.objects.size;
  }

  createSignedUpload(path: string): Promise<SignedUpload> {
    if (this.failure) {
      return Promise.reject(this.failure);
    }
    this.signedPaths.push(path);
    return Promise.resolve({
      signedUrl: `https://fake.storage.test/object/upload/sign/product-images/${path}?token=tok-${this.signedPaths.length}`,
      token: `tok-${this.signedPaths.length}`,
      path,
      expiresInSeconds: EXPIRES_IN_SECONDS,
    });
  }

  head(path: string): Promise<StoredObjectInfo | null> {
    if (this.failure) {
      return Promise.reject(this.failure);
    }
    return Promise.resolve(this.objects.get(path) ?? null);
  }

  publicUrl(path: string): string {
    return `${PUBLIC_URL_PREFIX}${path}`;
  }

  remove(path: string): Promise<void> {
    const error = this.failure ?? this.removeFailure;
    if (error) {
      return Promise.reject(error);
    }
    this.removedPaths.push(path);
    // Best-effort by contract: deleting something already gone is not an error.
    this.objects.delete(path);
    return Promise.resolve();
  }
}
