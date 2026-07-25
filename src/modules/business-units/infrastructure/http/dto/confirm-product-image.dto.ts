import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class ConfirmProductImageDto {
  @ApiProperty({
    example:
      'products/550e8400-e29b-41d4-a716-446655440000/f81d4fae-7dec-41d0-a765-00a0c91e6bf6.jpg',
    maxLength: 300,
    description: 'The `path` returned by the upload-url endpoint, echoed back verbatim.',
  })
  // Type and length only. The authoritative check is ProductImagePath.parse,
  // which needs the productId from the route - something a DTO validator cannot
  // see. A duplicate format regex here would answer 400 before the real rule
  // could answer 422, leaving the domain error unreachable.
  @IsString()
  @MaxLength(300)
  path!: string;
}
