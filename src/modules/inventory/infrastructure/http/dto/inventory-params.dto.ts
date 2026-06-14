import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class InventoryUnitParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  businessUnitId!: string;
}
