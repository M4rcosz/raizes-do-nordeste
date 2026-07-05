import { ApiProperty } from '@nestjs/swagger';
import { Category } from '../../../domain/entities/category.entity';

export class CategoryResponseDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  public readonly id: string;

  @ApiProperty({ example: 'Bebidas' })
  public readonly name: string;

  @ApiProperty({
    example: 'Sucos, refrigerantes e água',
    type: String,
    nullable: true,
  })
  public readonly description: string | null;

  @ApiProperty({ example: true })
  public readonly isActive: boolean;

  @ApiProperty({ example: '2026-05-18T10:30:00.000Z' })
  public readonly createdAt: Date;

  @ApiProperty({ example: '2026-05-18T10:30:00.000Z' })
  public readonly updatedAt: Date;

  constructor(
    id: string,
    name: string,
    description: string | null,
    isActive: boolean,
    createdAt: Date,
    updatedAt: Date,
  ) {
    this.id = id;
    this.name = name;
    this.description = description;
    this.isActive = isActive;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  static fromEntity(category: Category): CategoryResponseDto {
    return new CategoryResponseDto(
      category.id,
      category.name,
      category.description,
      category.isActive,
      category.createdAt,
      category.updatedAt,
    );
  }
}
