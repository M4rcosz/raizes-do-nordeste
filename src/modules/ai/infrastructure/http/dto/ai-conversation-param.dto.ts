import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AiConversationParamDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  conversationId!: string;
}
