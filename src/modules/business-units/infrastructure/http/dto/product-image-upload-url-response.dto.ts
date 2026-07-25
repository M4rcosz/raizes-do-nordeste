import { ApiProperty } from '@nestjs/swagger';
import type { SignedUpload } from '@modules/business-units/application/ports/product-image-storage.port';

/**
 * Credentials for one direct-to-storage upload. `path` is echoed back on confirm,
 * where the server re-parses it against the product - it is not a secret, and it
 * is never trusted.
 */
export class ProductImageUploadUrlResponseDto {
  @ApiProperty({
    example:
      'https://project.supabase.co/storage/v1/object/upload/sign/product-images/products/550e8400-e29b-41d4-a716-446655440000/f81d4fae-7dec-41d0-a765-00a0c91e6bf6.jpg?token=...',
    description: 'Upload target. Use it with the storage SDK, or PUT the file to it directly.',
  })
  public readonly signedUrl: string;

  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'Upload token, for storage.from(bucket).uploadToSignedUrl(path, token, file).',
  })
  public readonly token: string;

  @ApiProperty({
    example:
      'products/550e8400-e29b-41d4-a716-446655440000/f81d4fae-7dec-41d0-a765-00a0c91e6bf6.jpg',
    description: 'Object path. Send it back verbatim to the confirm endpoint.',
  })
  public readonly path: string;

  @ApiProperty({
    example: 7200,
    description: 'Token lifetime in seconds (fixed at 2 hours by the provider).',
  })
  public readonly expiresInSeconds: number;

  constructor(signedUrl: string, token: string, path: string, expiresInSeconds: number) {
    this.signedUrl = signedUrl;
    this.token = token;
    this.path = path;
    this.expiresInSeconds = expiresInSeconds;
  }

  static fromSignedUpload(upload: SignedUpload): ProductImageUploadUrlResponseDto {
    return new ProductImageUploadUrlResponseDto(
      upload.signedUrl,
      upload.token,
      upload.path,
      upload.expiresInSeconds,
    );
  }
}
