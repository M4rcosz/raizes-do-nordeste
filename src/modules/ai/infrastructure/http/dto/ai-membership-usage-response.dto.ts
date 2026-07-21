import { ApiProperty } from '@nestjs/swagger';
import { CursorPaginationMetaDto } from '@shared/pagination/cursor-pagination-meta.dto';
import type {
  AiMembershipUsage,
  ListAiMembershipsResult,
} from '@modules/ai/application/use-cases/list-ai-memberships.use-case';

class AiMembershipUsageItemDto {
  @ApiProperty({ format: 'uuid' })
  readonly id!: string;

  @ApiProperty({ format: 'uuid' })
  readonly userId!: string;

  @ApiProperty({ nullable: true, description: 'Null when the user record no longer resolves.' })
  readonly userName!: string | null;

  @ApiProperty({ nullable: true, description: 'Null when the account has no email on file.' })
  readonly userEmail!: string | null;

  @ApiProperty({ example: 10000, description: 'Remaining AI token balance.' })
  readonly tokenBalance!: number;

  @ApiProperty({ example: 320, description: 'Tokens spent inside the reported window.' })
  readonly tokensUsedInPeriod!: number;

  @ApiProperty({ description: 'Whether the membership is currently revoked.' })
  readonly isRevoked!: boolean;

  @ApiProperty({
    nullable: true,
    description: 'When the membership was soft-revoked, or null if active.',
  })
  readonly revokedAt!: Date | null;

  @ApiProperty()
  readonly createdAt!: Date;

  static fromUsage(usage: AiMembershipUsage): AiMembershipUsageItemDto {
    return Object.assign(new AiMembershipUsageItemDto(), {
      id: usage.membership.id,
      userId: usage.membership.userId,
      userName: usage.user?.name ?? null,
      userEmail: usage.user?.email ?? null,
      tokenBalance: usage.membership.tokenBalance,
      tokensUsedInPeriod: usage.tokensUsedInPeriod,
      isRevoked: usage.membership.isRevoked,
      revokedAt: usage.membership.revokedAt,
      createdAt: usage.membership.createdAt,
    });
  }
}

/** The standard data/meta page envelope plus the window the totals were taken over. */
export class AiMembershipUsageResponseDto {
  @ApiProperty({ description: 'Start of the window the totals cover (inclusive).' })
  readonly periodFrom!: Date;

  @ApiProperty({ description: 'End of the window the totals cover (inclusive).' })
  readonly periodTo!: Date;

  @ApiProperty({ type: [AiMembershipUsageItemDto] })
  readonly data!: AiMembershipUsageItemDto[];

  @ApiProperty({ type: CursorPaginationMetaDto })
  readonly meta!: CursorPaginationMetaDto;

  static fromResult(result: ListAiMembershipsResult): AiMembershipUsageResponseDto {
    return Object.assign(new AiMembershipUsageResponseDto(), {
      periodFrom: result.periodFrom,
      periodTo: result.periodTo,
      data: result.page.data.map((usage) => AiMembershipUsageItemDto.fromUsage(usage)),
      meta: result.page.meta,
    });
  }
}
