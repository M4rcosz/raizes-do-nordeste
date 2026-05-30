import { CreateOrderUseCase } from '@modules/orders/application/use-cases/create-order.use-case';
import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrderCreateDto } from '../dto/order-create.dto';
import { OrderResponseDto } from '../dto/order-response.dto';
import { CurrentUser } from '@shared/auth/current-user.decorator';
import type { JwtPayload } from '@shared/auth/jwt-payload.type';
import { UserRole } from '@modules/identity/domain/value-objects/user-role';

@ApiTags('orders')
@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(private readonly createOrder: CreateOrderUseCase) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create an order for the current channel.' })
  @ApiCreatedResponse({ type: OrderResponseDto })
  async create(
    @Body() body: OrderCreateDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<OrderResponseDto> {
    const actor = { id: user.sub, isStaff: user.role !== UserRole.CUSTOMER };

    const order = await this.createOrder.execute(body, actor);

    return OrderResponseDto.fromEntity(order);
  }
}
