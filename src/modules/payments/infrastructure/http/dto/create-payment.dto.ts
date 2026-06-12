import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsUUID } from 'class-validator';
import { PaymentMethod } from '@modules/payments/domain/value-objects/payment-method';

export class CreatePaymentDto {
  @ApiProperty({ format: 'uuid', description: 'Order being paid.' })
  @IsUUID()
  orderId!: string;

  @ApiProperty({ enum: PaymentMethod, description: 'Tender used to pay.' })
  @IsEnum(PaymentMethod)
  method!: PaymentMethod;
}
