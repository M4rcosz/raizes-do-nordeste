import { describe, expect, it } from '@jest/globals';
import { Money } from '@shared/domain/value-objects/money';
import { Product } from '../../../domain/entities/product.entity';
import { ProductResponseDto } from './product-response.dto';

describe('ProductResponseDto', () => {
  describe('fromEntity', () => {
    it('should map a Product entity to its response DTO and serialize Money as a decimal string', () => {
      const createdAt = new Date('2026-01-01T00:00:00Z');
      const updatedAt = new Date('2026-01-02T00:00:00Z');
      const product = new Product(
        'uuid-1',
        'Açaí',
        'Refreshing fruit pulp',
        Money.fromDecimalString('12.50'),
        true,
        'category-uuid-1',
        createdAt,
        updatedAt,
        'https://example.com/acai.jpg',
      );

      const dto = ProductResponseDto.fromEntity(product);

      expect(dto).toBeInstanceOf(ProductResponseDto);
      expect(dto).toEqual({
        id: 'uuid-1',
        name: 'Açaí',
        description: 'Refreshing fruit pulp',
        price: '12.50',
        isActive: true,
        categoryId: 'category-uuid-1',
        createdAt,
        updatedAt,
        imageUrl: 'https://example.com/acai.jpg',
      });
    });

    it('should preserve null description', () => {
      const product = new Product(
        'uuid-1',
        'Açaí',
        null,
        Money.fromDecimalString('10'),
        true,
        'category-uuid-1',
        new Date(),
        new Date(),
        'https://example.com/acai.jpg',
      );

      const dto = ProductResponseDto.fromEntity(product);

      expect(dto.description).toBeNull();
    });
  });
});
