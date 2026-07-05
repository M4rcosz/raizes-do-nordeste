import { describe, expect, it } from '@jest/globals';
import { Category } from '../../../domain/entities/category.entity';
import { CategoryResponseDto } from './category-response.dto';

describe('CategoryResponseDto', () => {
  describe('fromEntity', () => {
    it('should map a Category entity to its response DTO', () => {
      const createdAt = new Date('2026-01-01T00:00:00Z');
      const updatedAt = new Date('2026-01-02T00:00:00Z');
      const category = new Category('uuid-1', 'Bebidas', 'Sucos', true, createdAt, updatedAt);

      const dto = CategoryResponseDto.fromEntity(category);

      expect(dto).toBeInstanceOf(CategoryResponseDto);
      expect(dto).toEqual({
        id: 'uuid-1',
        name: 'Bebidas',
        description: 'Sucos',
        isActive: true,
        createdAt,
        updatedAt,
      });
    });

    it('should preserve null description', () => {
      const category = new Category('uuid-1', 'Bebidas', null, true, new Date(), new Date());

      const dto = CategoryResponseDto.fromEntity(category);

      expect(dto.description).toBeNull();
    });
  });
});
