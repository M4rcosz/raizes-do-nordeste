import { ApiProperty } from '@nestjs/swagger';
import { BusinessUnit } from '../../../domain/entities/business-unit.entity';

/** Full internal view of a business unit (ADMIN/MANAGER only). */
export class BusinessUnitResponseDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  public readonly id: string;

  @ApiProperty({ example: 'Nexio Pelourinho' })
  public readonly name: string;

  @ApiProperty({ example: '12345678000190' })
  public readonly cnpj: string;

  @ApiProperty({ example: 'Largo do Pelourinho, 10' })
  public readonly address: string;

  @ApiProperty({ example: 'Salvador' })
  public readonly city: string;

  @ApiProperty({ example: '7132223344' })
  public readonly phone: string;

  @ApiProperty({ example: true })
  public readonly isActive: boolean;

  @ApiProperty({ example: '2026-05-18T10:30:00.000Z' })
  public readonly createdAt: Date;

  @ApiProperty({ example: '2026-05-18T10:30:00.000Z' })
  public readonly updatedAt: Date;

  constructor(
    id: string,
    name: string,
    cnpj: string,
    address: string,
    city: string,
    phone: string,
    isActive: boolean,
    createdAt: Date,
    updatedAt: Date,
  ) {
    this.id = id;
    this.name = name;
    this.cnpj = cnpj;
    this.address = address;
    this.city = city;
    this.phone = phone;
    this.isActive = isActive;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  static fromEntity(unit: BusinessUnit): BusinessUnitResponseDto {
    return new BusinessUnitResponseDto(
      unit.id,
      unit.name,
      unit.cnpj,
      unit.address,
      unit.city,
      unit.phone,
      unit.isActive,
      unit.createdAt,
      unit.updatedAt,
    );
  }
}
