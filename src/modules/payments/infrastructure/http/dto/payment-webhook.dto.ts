import { ApiProperty } from '@nestjs/swagger';
import { IsDecimal, IsIn, IsNotEmpty, IsString } from 'class-validator';
import { PaymentStatus } from '@modules/payments/domain/value-objects/payment-status';

/** Statuses a gateway webhook may deliver - a settled outcome, never an in-flight one. */
const WEBHOOK_STATUSES = [PaymentStatus.APPROVED, PaymentStatus.REFUSED] as const;

type WebhookStatus = (typeof WEBHOOK_STATUSES)[number];

export class PaymentWebhookDto {
  @ApiProperty({ description: "The gateway's transaction id returned at charge time." })
  @IsString()
  @IsNotEmpty()
  extTransactionId!: string;

  @ApiProperty({ enum: WEBHOOK_STATUSES, description: 'Settled outcome reported by the gateway.' })
  @IsIn(WEBHOOK_STATUSES)
  status!: WebhookStatus;

  @ApiProperty({
    example: '25.00',
    description: 'Amount the gateway settled, as a decimal string; must match what we charged.',
  })
  @IsDecimal(
    { decimal_digits: '0,2' },
    { message: 'amount must be a decimal string with up to 2 decimal places' },
  )
  amount!: string;
}
