import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AiMembershipUserParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  userId!: string;
}
