import { ApiProperty } from '@nestjs/swagger';
import { Payment } from '@modules/payments/domain/entities/payment.entity';
import { PaymentMethod } from '@modules/payments/domain/value-objects/payment-method';
import { PaymentStatus } from '@modules/payments/domain/value-objects/payment-status';

export class PaymentResponseDto {
  @ApiProperty({ format: 'uuid' })
  readonly id!: string;

  @ApiProperty({ format: 'uuid' })
  readonly orderId!: string;

  @ApiProperty({ example: '25.00', description: 'Money serialized as a decimal string.' })
  readonly amount!: string;

  @ApiProperty({ enum: PaymentMethod })
  readonly method!: PaymentMethod;

  @ApiProperty({ enum: PaymentStatus })
  readonly status!: PaymentStatus;

  @ApiProperty({ nullable: true, description: "The gateway's transaction id, if assigned." })
  readonly extTransactionId!: string | null;

  @ApiProperty()
  readonly createdAt!: Date;

  @ApiProperty()
  readonly updatedAt!: Date;

  static fromEntity(payment: Payment): PaymentResponseDto {
    return Object.assign(new PaymentResponseDto(), {
      id: payment.id,
      orderId: payment.orderId,
      amount: payment.amount.toDecimalString(),
      method: payment.method,
      status: payment.status,
      extTransactionId: payment.extTransactionId,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
    });
  }
}
