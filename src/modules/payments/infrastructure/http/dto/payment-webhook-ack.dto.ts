import { ApiProperty } from '@nestjs/swagger';

/**
 * Uniform 200 acknowledgement for the gateway. We never return our internal payment
 * representation to the gateway, and we ack even unmatched events so it stops redelivering.
 */
export class PaymentWebhookAckDto {
  @ApiProperty({ example: true, description: 'The webhook was received and processed.' })
  readonly received!: boolean;
}
