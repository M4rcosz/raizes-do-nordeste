import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  PRODUCT_REPOSITORY,
  type ProductRepository,
} from '../../domain/repositories/product.repository';
import {
  ProductImagePath,
  type ProductImageContentType,
} from '../../domain/value-objects/product-image-path';
import {
  PRODUCT_IMAGE_STORAGE,
  type ProductImageStorage,
  type SignedUpload,
} from '../ports/product-image-storage.port';
import { ProductNotFoundError } from '../errors/product-not-found.error';
import { ProductImageStorageError } from '../errors/product-image-storage.error';

export interface CreateProductImageUploadUrlInput {
  productId: string;
  contentType: ProductImageContentType;
}

/**
 * Step 1 of the two-step upload: mint a signed URL the client PUTs the file to
 * directly, so the image bytes never traverse this API.
 *
 * Writes NOTHING. The path is a pure function of the product id and a per-call
 * random token, so nothing has to be remembered between mint and confirm - the
 * confirm step re-derives the same rule from the path the client echoes back.
 */
@Injectable()
export class CreateProductImageUploadUrlUseCase {
  constructor(
    @Inject(PRODUCT_REPOSITORY)
    private readonly products: ProductRepository,
    @Inject(PRODUCT_IMAGE_STORAGE)
    private readonly storage: ProductImageStorage,
  ) {}

  async execute(input: CreateProductImageUploadUrlInput): Promise<SignedUpload> {
    const product = await this.products.findById(input.productId);
    if (!product) {
      throw new ProductNotFoundError(`Product with id "${input.productId}" not found.`);
    }

    // Fresh token per call, so a replacement never reuses the old object name and
    // therefore never has to fight a CDN cache on the previous URL.
    const path = ProductImagePath.mint(input.productId, input.contentType, randomUUID());

    try {
      return await this.storage.createSignedUpload(path.value);
    } catch (err) {
      throw new ProductImageStorageError(undefined, { cause: err });
    }
  }
}
