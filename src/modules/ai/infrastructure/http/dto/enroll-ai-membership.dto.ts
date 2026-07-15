import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import { MAX_TOKEN_BALANCE } from '@modules/ai/domain/entities/ai-membership.entity';

export class EnrollAiMembershipDto {
  // userId comes from the route param, not the body.
  @ApiProperty({
    example: 10000,
    minimum: 0,
    maximum: MAX_TOKEN_BALANCE,
    description: 'Starting token balance granted to the user.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_TOKEN_BALANCE)
  initialBalance!: number;
}
