import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotIn, Max, Min } from 'class-validator';
import { MAX_TOKEN_BALANCE } from '@modules/ai/domain/entities/ai-membership.entity';

export class AdjustAiMembershipBalanceDto {
  @ApiProperty({
    example: 5000,
    minimum: -MAX_TOKEN_BALANCE,
    maximum: MAX_TOKEN_BALANCE,
    description: 'Signed delta: positive credits, negative debits. Zero is rejected.',
  })
  @Type(() => Number)
  @IsInt()
  @IsNotIn([0])
  @Min(-MAX_TOKEN_BALANCE)
  @Max(MAX_TOKEN_BALANCE)
  delta!: number;
}
