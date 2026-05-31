import { CreateOrderUseCase } from '@modules/orders/application/use-cases/create-order.use-case';
import { FindOrderByIdUseCase } from '@modules/orders/application/use-cases/find-order-by-id.use-case';
import { ListOrdersUseCase } from '@modules/orders/application/use-cases/list-orders.use-case';
import { UpdateOrderStatusUseCase } from '@modules/orders/application/use-cases/update-order-status.use-case';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { OrderCreateDto } from '../dto/order-create.dto';
import { OrderResponseDto } from '../dto/order-response.dto';
import { OrderIdParamDto, OrdersQueryDto } from '../dto/order-query.dto';
import { OrderUpdateStatusDto } from '../dto/order-update-status.dto';
import { PaginatedOrderResponseDto } from '../dto/paginated-order-response.dto';
import { PaginatedResponseDto } from '@shared/pagination/paginated-response.dto';
import { sanitizeLimit } from '@shared/pagination/pagination';
import { CurrentUser } from '@shared/auth/current-user.decorator';
import { Roles } from '@shared/auth/roles.decorator';
import type { JwtPayload } from '@shared/auth/jwt-payload.type';
import { UserRole } from '@modules/identity/domain/value-objects/user-role';

/** Non-customer roles may list any order and change order status. */
const STAFF_ROLES: UserRole[] = [
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.ATTENDANT,
  UserRole.KITCHEN,
];

@ApiTags('orders')
@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly createOrder: CreateOrderUseCase,
    private readonly findOrderById: FindOrderByIdUseCase,
    private readonly listOrders: ListOrdersUseCase,
    private readonly updateOrderStatus: UpdateOrderStatusUseCase,
  ) {}

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

  @Get()
  @Roles(STAFF_ROLES)
  @ApiOperation({ summary: 'List orders with optional filters (cursor-paginated). Staff only.' })
  @ApiOkResponse({ type: PaginatedOrderResponseDto })
  async list(@Query() query: OrdersQueryDto): Promise<PaginatedResponseDto<OrderResponseDto>> {
    const { limit: rawLimit, cursor, businessUnitId, orderChannel, orderStatus } = query;
    const limit = sanitizeLimit(rawLimit);

    const result = await this.listOrders.execute({
      cursor,
      limit,
      filters: { businessUnitId, orderChannel, orderStatus },
    });

    return new PaginatedResponseDto(
      result.data.map((order) => OrderResponseDto.fromEntity(order)),
      result.meta,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an order by ID. Customers may only see their own orders.' })
  @ApiOkResponse({ type: OrderResponseDto })
  @ApiNotFoundResponse({ description: 'Order not found or not visible to the requester.' })
  async findById(
    @Param() { id }: OrderIdParamDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<OrderResponseDto> {
    const order = await this.findOrderById.execute(id, { id: user.sub, role: user.role });
    return OrderResponseDto.fromEntity(order);
  }

  @Patch(':id/status')
  @Roles(STAFF_ROLES)
  @ApiOperation({ summary: 'Change an order status (state machine enforced). Staff only.' })
  @ApiOkResponse({ type: OrderResponseDto })
  @ApiNotFoundResponse({ description: 'Order not found.' })
  @ApiUnprocessableEntityResponse({ description: 'Status transition not allowed.' })
  async changeStatus(
    @Param() { id }: OrderIdParamDto,
    @Body() body: OrderUpdateStatusDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<OrderResponseDto> {
    const order = await this.updateOrderStatus.execute(
      { orderId: id, orderStatus: body.orderStatus },
      user.sub,
    );
    return OrderResponseDto.fromEntity(order);
  }
}
