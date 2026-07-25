import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import {
  PRODUCT_IMAGE_CONTENT_TYPES,
  type ProductImageContentType,
} from '@modules/business-units/application/ports/product-image-storage.port';

export class ProductImageUploadUrlRequestDto {
  @ApiProperty({
    enum: PRODUCT_IMAGE_CONTENT_TYPES,
    example: 'image/jpeg',
    description: 'MIME type of the file about to be uploaded. Decides the object extension.',
  })
  // A string field, so no @Type() is needed (implicit conversion is off only for
  // non-string values). The allowlist is shared with the value object's
  // contentType -> extension map, so the two can never drift.
  @IsIn(PRODUCT_IMAGE_CONTENT_TYPES)
  contentType!: ProductImageContentType;
}
