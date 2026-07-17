import {
  CreateOrderUseCase,
  type OrderIdempotency,
} from '@modules/orders/application/use-cases/create-order.use-case';
import { CancelOrderUseCase } from '@modules/orders/application/use-cases/cancel-order.use-case';
import { FindOrderByIdUseCase } from '@modules/orders/application/use-cases/find-order-by-id.use-case';
import { ListMyOrdersUseCase } from '@modules/orders/application/use-cases/list-my-orders.use-case';
import { ListOrdersUseCase } from '@modules/orders/application/use-cases/list-orders.use-case';
import { UpdateOrderStatusUseCase } from '@modules/orders/application/use-cases/update-order-status.use-case';
import { createHash } from 'node:crypto';
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { OrderCreateDto } from '../dto/order-create.dto';
import { OrderResponseDto } from '../dto/order-response.dto';
import { MyOrdersQueryDto } from '../dto/my-orders-query.dto';
import { OrderIdParamDto, OrdersQueryDto } from '../dto/order-query.dto';
import { OrderUpdateStatusDto } from '../dto/order-update-status.dto';
import { PaginatedOrderResponseDto } from '../dto/paginated-order-response.dto';
import { PaginatedResponseDto } from '@shared/pagination/paginated-response.dto';
import { sanitizeLimit } from '@shared/pagination/pagination';
import { CurrentUser } from '@shared/auth/current-user.decorator';
import { Roles } from '@shared/auth/roles.decorator';
import type { JwtPayload } from '@shared/auth/jwt-payload.type';
import { UserRole } from '@modules/identity/domain/value-objects/user-role';
import { DEFAULT_ORDER_SORT } from '@modules/orders/domain/value-objects/order-sort';

/** Endpoint identity for idempotency scoping; a key is unique per (user, endpoint). */
const CREATE_ORDER_ENDPOINT = 'POST /orders';
/** Cap on the client-supplied Idempotency-Key; longer values are ignored (treated as absent). */
const MAX_IDEMPOTENCY_KEY_LENGTH = 255;

/** Non-customer roles may list any order and change order status. */
const STAFF_ROLES: UserRole[] = [
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.ATTENDANT,
  UserRole.KITCHEN,
];

/**
 * Roles allowed to attend an order on attendant-only channels (COUNTER/PICKUP).
 * KITCHEN is staff but does not serve customers, so it is intentionally excluded.
 */
const ATTENDING_ROLES: UserRole[] = [UserRole.ADMIN, UserRole.MANAGER, UserRole.ATTENDANT];

@ApiTags('orders')
@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly createOrder: CreateOrderUseCase,
    private readonly cancelOrder: CancelOrderUseCase,
    private readonly findOrderById: FindOrderByIdUseCase,
    private readonly listMyOrders: ListMyOrdersUseCase,
    private readonly listOrders: ListOrdersUseCase,
    private readonly updateOrderStatus: UpdateOrderStatusUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create an order for the current channel.' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description:
      'Optional per-user key (24h TTL). A replay with the same body returns the original order.',
  })
  @ApiCreatedResponse({ type: OrderResponseDto })
  @ApiConflictResponse({ description: 'Idempotency-Key reused with a different request body.' })
  async create(
    @Body() body: OrderCreateDto,
    @CurrentUser() user: JwtPayload,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<OrderResponseDto> {
    const actor = { id: user.sub, canAttend: ATTENDING_ROLES.includes(user.role) };

    const order = await this.createOrder.execute(
      body,
      actor,
      this.idempotencyOf(idempotencyKey, user.sub, body),
    );

    return OrderResponseDto.fromEntity(order);
  }

  /**
   * Builds the idempotency envelope when the client sent a usable Idempotency-Key.
   * The request hash lets the use case reject the same key reused with a different
   * body. Absent/blank/oversized keys disable idempotency (the create runs normally).
   */
  private idempotencyOf(
    rawKey: string | undefined,
    userId: string,
    body: OrderCreateDto,
  ): OrderIdempotency | undefined {
    const key = rawKey?.trim();
    if (!key || key.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
      return undefined;
    }
    const requestHash = createHash('sha256').update(JSON.stringify(body)).digest('hex');
    return { key, userId, endpoint: CREATE_ORDER_ENDPOINT, requestHash };
  }

  @Get()
  @Roles(STAFF_ROLES)
  @ApiOperation({ summary: 'List orders with optional filters (cursor-paginated). Staff only.' })
  @ApiOkResponse({ type: PaginatedOrderResponseDto })
  @ApiUnprocessableEntityResponse({ description: 'Cursor is invalid or does not match the sort.' })
  async list(
    @Query() query: OrdersQueryDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<PaginatedResponseDto<OrderResponseDto>> {
    const {
      limit: rawLimit,
      cursor,
      businessUnitId,
      orderChannel,
      orderStatus,
      attendantId,
      customerId,
      createdAtFrom,
      createdAtTo,
      minTotal,
      maxTotal,
      sortBy,
      sortDir,
    } = query;
    const limit = sanitizeLimit(rawLimit);

    const result = await this.listOrders.execute({
      cursor,
      limit,
      filters: {
        businessUnitId,
        orderChannel,
        orderStatus,
        attendantId,
        customerId,
        createdAtFrom,
        createdAtTo,
        minTotal,
        maxTotal,
      },
      sort: {
        field: sortBy ?? DEFAULT_ORDER_SORT.field,
        direction: sortDir ?? DEFAULT_ORDER_SORT.direction,
      },
      actor: { id: user.sub, role: user.role, businessUnitIds: user.businessUnitIds },
    });

    return new PaginatedResponseDto(
      result.data.map((order) => OrderResponseDto.fromEntity(order)),
      result.meta,
    );
  }

  // Declared before GET :id so NestJS matches /me literally, not as a UUID param.
  @Get('me')
  @Roles([UserRole.CUSTOMER])
  @ApiOperation({ summary: "List the authenticated customer's own orders (cursor-paginated)." })
  @ApiOkResponse({ type: PaginatedOrderResponseDto })
  async listMine(
    @Query() query: MyOrdersQueryDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<PaginatedResponseDto<OrderResponseDto>> {
    const { limit: rawLimit, cursor, orderChannel, orderStatus } = query;
    const limit = sanitizeLimit(rawLimit);

    const result = await this.listMyOrders.execute({
      customerId: user.sub,
      filters: { orderChannel, orderStatus },
      cursor,
      limit,
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
    const order = await this.findOrderById.execute(id, {
      id: user.sub,
      role: user.role,
      businessUnitIds: user.businessUnitIds,
    });
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
      undefined,
      { id: user.sub, role: user.role, businessUnitIds: user.businessUnitIds },
    );
    return OrderResponseDto.fromEntity(order);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Cancel an order and run its compensations (restock, refund, loyalty reversal). ' +
      'Staff of the unit while PENDING/CONFIRMED; a customer only their own while PENDING.',
  })
  @ApiOkResponse({ type: OrderResponseDto })
  @ApiNotFoundResponse({ description: 'Order not found or not visible to the requester.' })
  @ApiUnprocessableEntityResponse({ description: 'Order is past the cancellation window.' })
  async cancel(
    @Param() { id }: OrderIdParamDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<OrderResponseDto> {
    const order = await this.cancelOrder.execute(id, {
      id: user.sub,
      role: user.role,
      businessUnitIds: user.businessUnitIds,
    });
    return OrderResponseDto.fromEntity(order);
  }
}
