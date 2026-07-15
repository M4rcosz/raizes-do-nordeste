import { ApiProperty } from '@nestjs/swagger';
import { AiMembership } from '@modules/ai/domain/entities/ai-membership.entity';

export class AiMembershipResponseDto {
  @ApiProperty({ format: 'uuid' })
  readonly id!: string;

  @ApiProperty({ format: 'uuid' })
  readonly userId!: string;

  @ApiProperty({ example: 10000, description: 'Remaining AI token balance.' })
  readonly tokenBalance!: number;

  @ApiProperty()
  readonly createdAt!: Date;

  static fromEntity(membership: AiMembership): AiMembershipResponseDto {
    return Object.assign(new AiMembershipResponseDto(), {
      id: membership.id,
      userId: membership.userId,
      tokenBalance: membership.tokenBalance,
      createdAt: membership.createdAt,
    });
  }
}
