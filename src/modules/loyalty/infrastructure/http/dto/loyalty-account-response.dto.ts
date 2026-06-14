import { ApiProperty } from '@nestjs/swagger';
import { LoyaltyAccount } from '@modules/loyalty/domain/entities/loyalty-account.entity';

export class LoyaltyAccountResponseDto {
  @ApiProperty({ format: 'uuid' })
  readonly id!: string;

  @ApiProperty({ format: 'uuid' })
  readonly customerId!: string;

  @ApiProperty({ example: 42 })
  readonly totalPoints!: number;

  @ApiProperty({ description: 'Points only accrue after the customer consents (LGPD).' })
  readonly consentGiven!: boolean;

  @ApiProperty({ nullable: true })
  readonly consentDate!: Date | null;

  @ApiProperty()
  readonly createdAt!: Date;

  static fromEntity(account: LoyaltyAccount): LoyaltyAccountResponseDto {
    return Object.assign(new LoyaltyAccountResponseDto(), {
      id: account.id,
      customerId: account.customerId,
      totalPoints: account.totalPoints,
      consentGiven: account.consentGiven,
      consentDate: account.consentDate,
      createdAt: account.createdAt,
    });
  }
}
