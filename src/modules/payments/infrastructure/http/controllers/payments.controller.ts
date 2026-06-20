import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '@shared/auth/current-user.decorator';
import { Public } from '@shared/auth/public.decorator';
import type { JwtPayload } from '@shared/auth/jwt-payload.type';
import { CreatePaymentUseCase } from '@modules/payments/application/use-cases/create-payment.use-case';
import { ConfirmPaymentUseCase } from '@modules/payments/application/use-cases/confirm-payment.use-case';
import { FindPaymentByOrderUseCase } from '@modules/payments/application/use-cases/find-payment-by-order.use-case';
import { CreatePaymentDto } from '../dto/create-payment.dto';
import { PaymentWebhookDto } from '../dto/payment-webhook.dto';
import { PaymentWebhookAckDto } from '../dto/payment-webhook-ack.dto';
import { OrderPaymentParamDto } from '../dto/payment-params.dto';
import { PaymentResponseDto } from '../dto/payment-response.dto';
import { PaymentWebhookGuard } from '../guards/payment-webhook.guard';
import { SkipThrottle } from '@nestjs/throttler';

@ApiTags('payments')
@Controller()
export class PaymentsController {
  constructor(
    private readonly createPayment: CreatePaymentUseCase,
    private readonly confirmPayment: ConfirmPaymentUseCase,
    private readonly findPaymentByOrder: FindPaymentByOrderUseCase,
  ) {}

  @Post('payments')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a payment for an order and charge the gateway.' })
  @ApiCreatedResponse({ type: PaymentResponseDto })
  @ApiNotFoundResponse({ description: 'Order not found.' })
  @ApiUnprocessableEntityResponse({ description: 'Order is not awaiting payment or already paid.' })
  async create(
    @Body() body: CreatePaymentDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<PaymentResponseDto> {
    const payment = await this.createPayment.execute(
      { orderId: body.orderId, method: body.method },
      { id: user.sub, role: user.role },
    );
    return PaymentResponseDto.fromEntity(payment);
  }

  // Gateway callbacks are authenticated by HMAC and can legitimately burst on
  // retries, so they are exempt from the rate limiter.
  @SkipThrottle()
  @Post('payments/webhook')
  @Public()
  @UseGuards(PaymentWebhookGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Gateway webhook: settle a payment and advance its order.' })
  @ApiOkResponse({ type: PaymentWebhookAckDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid webhook signature.' })
  async webhook(@Body() body: PaymentWebhookDto): Promise<PaymentWebhookAckDto> {
    // Always ack with 200: the gateway only cares about the status code, and a non-2xx on
    // an unknown/duplicate event would trigger endless redelivery. confirmPayment records
    // anything it cannot settle for reconciliation.
    await this.confirmPayment.execute({
      extTransactionId: body.extTransactionId,
      status: body.status,
      amount: body.amount,
    });
    return { received: true };
  }

  @Get('orders/:orderId/payment')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the payment of an order. Customers may only see their own.' })
  @ApiOkResponse({ type: PaymentResponseDto })
  @ApiNotFoundResponse({ description: 'Order has no payment, or is not visible to the requester.' })
  async findByOrder(
    @Param() { orderId }: OrderPaymentParamDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<PaymentResponseDto> {
    const payment = await this.findPaymentByOrder.execute(orderId, {
      id: user.sub,
      role: user.role,
    });
    return PaymentResponseDto.fromEntity(payment);
  }
}
