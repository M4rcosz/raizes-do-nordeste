import { beforeEach, describe, expect, it } from '@jest/globals';
import type { ConfigService } from '@nestjs/config';
import { StorageClient } from '@supabase/storage-js';
import { SupabaseProductImageStorageAdapter } from './supabase-product-image-storage.adapter';

// Same reason as the Gemini adapter spec: @swc/jest hoists jest.mock() above the
// imports, so an imported `jest` binding would be undefined at hoist time and the
// mock would silently no-op. Declaring the type keeps the file typed without
// emitting an import.
declare const jest: typeof import('@jest/globals').jest;

/** The slice of the SDK reply the adapter reads back. */
interface SignedUploadReply {
  data: { signedUrl: string; token: string; path: string } | null;
  error: Error | null;
}

const mockCreateSignedUploadUrl =
  jest.fn<(path: string, options?: { upsert?: boolean }) => Promise<SignedUploadReply>>();
const mockFrom = jest.fn(() => ({ createSignedUploadUrl: mockCreateSignedUploadUrl }));

jest.mock('@supabase/storage-js', () => ({
  StorageClient: jest.fn(() => ({ from: mockFrom })),
  // Only head()/remove() consult it, and this spec exercises neither.
  isStorageError: (): boolean => false,
}));

const PATH =
  'products/550e8400-e29b-41d4-a716-446655440000/f81d4fae-7dec-41d0-a765-00a0c91e6bf6.png';

const CONFIG: Record<string, string> = {
  SUPABASE_URL: 'https://project.supabase.co/',
  SUPABASE_SECRET_KEY: 'sb_secret_test',
  SUPABASE_PRODUCT_IMAGE_BUCKET: 'product-images',
};

function makeAdapter(): SupabaseProductImageStorageAdapter {
  const cfg = {
    getOrThrow: jest.fn((key: string) => CONFIG[key]),
  } as unknown as ConfigService;
  return new SupabaseProductImageStorageAdapter(cfg);
}

describe('SupabaseProductImageStorageAdapter', () => {
  beforeEach(() => {
    mockCreateSignedUploadUrl.mockReset();
    mockFrom.mockClear();
    jest.mocked(StorageClient).mockClear();
    mockCreateSignedUploadUrl.mockResolvedValue({
      data: { signedUrl: 'https://project.supabase.co/upload?token=tok', token: 'tok', path: PATH },
      error: null,
    });
  });

  it('binds the client to the configured bucket, trailing slash stripped', () => {
    makeAdapter();

    expect(jest.mocked(StorageClient).mock.calls[0][0]).toBe(
      'https://project.supabase.co/storage/v1',
    );
    expect(mockFrom).toHaveBeenCalledWith('product-images');
  });

  // The omission is the security property, so it gets a test. With upsert the
  // signed token stays usable for its whole 2-hour life, which lets a client swap
  // the bytes AFTER confirm published the public CDN URL for them.
  it('mints the upload URL WITHOUT an upsert option (single-use token)', async () => {
    await makeAdapter().createSignedUpload(PATH);

    expect(mockCreateSignedUploadUrl).toHaveBeenCalledWith(PATH);
    expect(mockCreateSignedUploadUrl.mock.calls[0]).toHaveLength(1);
    expect(mockCreateSignedUploadUrl.mock.calls[0][1]).toBeUndefined();
  });

  it('maps the SDK reply onto the port shape with the fixed 2-hour TTL', async () => {
    const result = await makeAdapter().createSignedUpload(PATH);

    expect(result).toEqual({
      signedUrl: 'https://project.supabase.co/upload?token=tok',
      token: 'tok',
      path: PATH,
      expiresInSeconds: 7200,
    });
  });

  it('propagates an SDK error as-is, for the use case to wrap', async () => {
    const boom = new Error('bucket exploded');
    mockCreateSignedUploadUrl.mockResolvedValue({ data: null, error: boom });

    await expect(makeAdapter().createSignedUpload(PATH)).rejects.toBe(boom);
  });
});
