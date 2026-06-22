import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class BusinessUnitCreateDto {
  @ApiProperty({ example: 'Raízes Pelourinho', maxLength: 120 })
  @MaxLength(120)
  @IsNotEmpty()
  @IsString()
  name!: string;

  @ApiProperty({
    example: '12345678000190',
    description: 'CNPJ as 14 digits, no mask.',
  })
  @Matches(/^\d{14}$/, { message: 'cnpj must be exactly 14 digits with no mask' })
  @IsString()
  cnpj!: string;

  @ApiProperty({ example: 'Largo do Pelourinho, 10', maxLength: 255 })
  @MaxLength(255)
  @IsNotEmpty()
  @IsString()
  address!: string;

  @ApiProperty({ example: 'Salvador', maxLength: 120 })
  @MaxLength(120)
  @IsNotEmpty()
  @IsString()
  city!: string;

  @ApiProperty({ example: '7132223344', maxLength: 20 })
  @MaxLength(20)
  @IsNotEmpty()
  @IsString()
  phone!: string;
}
