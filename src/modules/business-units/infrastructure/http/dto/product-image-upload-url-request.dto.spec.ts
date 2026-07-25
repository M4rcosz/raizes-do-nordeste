import { describe, expect, it } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ProductImageUploadUrlRequestDto } from './product-image-upload-url-request.dto';

/**
 * Calls class-validator directly: controller specs bypass the global
 * ValidationPipe in this project, so a decorator that silently stops matching the
 * allowlist would be invisible everywhere else.
 */
const validateBody = async (body: unknown): Promise<string[]> => {
  const dto = plainToInstance(ProductImageUploadUrlRequestDto, body);
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  return errors.map((e) => e.property);
};

describe('ProductImageUploadUrlRequestDto', () => {
  it.each(['image/png', 'image/jpeg', 'image/webp'])('accepts %s', async (contentType) => {
    await expect(validateBody({ contentType })).resolves.toEqual([]);
  });

  it.each([
    ['an SVG (scriptable, never an allowed image)', 'image/svg+xml'],
    ['HTML', 'text/html'],
    ['an empty string', ''],
    ['a gif', 'image/gif'],
    ['a wildcard', 'image/*'],
  ])('rejects %s', async (_label, contentType) => {
    await expect(validateBody({ contentType })).resolves.toEqual(['contentType']);
  });

  it('rejects a missing field', async () => {
    await expect(validateBody({})).resolves.toEqual(['contentType']);
  });

  it('rejects a non-string value', async () => {
    await expect(validateBody({ contentType: 1 })).resolves.toEqual(['contentType']);
  });
});
