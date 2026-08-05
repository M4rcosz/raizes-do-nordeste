import { ApiProperty } from '@nestjs/swagger';
import { BusinessUnit } from '../../../domain/entities/business-unit.entity';

/** Public view of a business unit. Omits cnpj, isActive and timestamps. */
export class PublicBusinessUnitResponseDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  public readonly id: string;

  @ApiProperty({ example: 'Nexio Pelourinho' })
  public readonly name: string;

  @ApiProperty({ example: 'Largo do Pelourinho, 10' })
  public readonly address: string;

  @ApiProperty({ example: 'Salvador' })
  public readonly city: string;

  @ApiProperty({ example: '7132223344' })
  public readonly phone: string;

  constructor(id: string, name: string, address: string, city: string, phone: string) {
    this.id = id;
    this.name = name;
    this.address = address;
    this.city = city;
    this.phone = phone;
  }

  static fromEntity(unit: BusinessUnit): PublicBusinessUnitResponseDto {
    return new PublicBusinessUnitResponseDto(
      unit.id,
      unit.name,
      unit.address,
      unit.city,
      unit.phone,
    );
  }
}
