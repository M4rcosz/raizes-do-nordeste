import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ChangePasswordUseCase } from '@modules/identity/application/use-cases/change-password.use-case';
import { CreateUserUseCase } from '@modules/identity/application/use-cases/create-user.use-case';
import { DeactivateUserUseCase } from '@modules/identity/application/use-cases/deactivate-user.use-case';
import { GetMyProfileUseCase } from '@modules/identity/application/use-cases/get-my-profile.use-case';
import { ListUsersUseCase } from '@modules/identity/application/use-cases/list-users.use-case';
import { LookupCustomerUseCase } from '@modules/identity/application/use-cases/lookup-customer.use-case';
import { ReactivateUserUseCase } from '@modules/identity/application/use-cases/reactivate-user.use-case';
import { RegisterCustomerUseCase } from '@modules/identity/application/use-cases/register-customer.use-case';
import { UpdateUserBusinessUnitsUseCase } from '@modules/identity/application/use-cases/update-user-business-units.use-case';
import { UpdateUserProfileUseCase } from '@modules/identity/application/use-cases/update-user-profile.use-case';
import { CurrentUser } from '@shared/auth/current-user.decorator';
import type { JwtPayload } from '@shared/auth/jwt-payload.type';
import { Public } from '@shared/auth/public.decorator';
import { Roles } from '@shared/auth/roles.decorator';
import { PaginatedResponseDto } from '@shared/pagination/paginated-response.dto';
import { sanitizeLimit } from '@shared/pagination/pagination';
import { ChangeMyPasswordDto } from '../dto/change-my-password-request.dto';
import { CreateUserDto } from '../dto/create-user-request.dto';
import { CustomerLookupResponseDto } from '../dto/customer-lookup-response.dto';
import { ListUsersQueryDto } from '../dto/list-users-query.dto';
import { LookupCustomerQueryDto } from '../dto/lookup-customer-query.dto';
import { PaginatedUserResponseDto } from '../dto/paginated-user-response.dto';
import { RegisterCustomerDto } from '../dto/register-customer-request.dto';
import { UpdateMyProfileDto } from '../dto/update-my-profile-request.dto';
import { UpdateUserBusinessUnitsDto } from '../dto/update-user-business-units-request.dto';
import { UserIdParamDto } from '../dto/user-params.dto';
import { UserResponseDto } from '../dto/user-response.dto';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly registerCustomer: RegisterCustomerUseCase,
    private readonly createUser: CreateUserUseCase,
    private readonly deactivateUser: DeactivateUserUseCase,
    private readonly reactivateUser: ReactivateUserUseCase,
    private readonly updateUserProfile: UpdateUserProfileUseCase,
    private readonly getMyProfile: GetMyProfileUseCase,
    private readonly changePassword: ChangePasswordUseCase,
    private readonly listUsers: ListUsersUseCase,
    private readonly updateUserBusinessUnits: UpdateUserBusinessUnitsUseCase,
    private readonly lookupCustomer: LookupCustomerUseCase,
  ) {}

  // Stricter limit than the global one to slow self-registration abuse.
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Self-register as a customer' })
  @ApiCreatedResponse({ type: UserResponseDto })
  @ApiConflictResponse({ description: 'Username, email, or phone already in use' })
  async register(@Body() body: RegisterCustomerDto): Promise<UserResponseDto> {
    const user = await this.registerCustomer.execute(body);
    return UserResponseDto.fromEntity(user);
  }

  @Roles(['ADMIN', 'MANAGER'])
  @Post()
  @ApiOperation({ summary: 'Create a staff or admin user' })
  @ApiCreatedResponse({ type: UserResponseDto })
  @ApiForbiddenResponse({ description: 'Your role may not create a user with that role' })
  @ApiConflictResponse({ description: 'Username, email, or phone already in use' })
  async create(
    @CurrentUser() actor: JwtPayload,
    @Body() body: CreateUserDto,
  ): Promise<UserResponseDto> {
    const user = await this.createUser.execute(
      { id: actor.sub, role: actor.role, businessUnitIds: actor.businessUnitIds },
      body,
    );
    return UserResponseDto.fromEntity(user);
  }

  @Roles(['ADMIN', 'MANAGER'])
  @Get()
  @ApiOperation({
    summary:
      'List users (cursor-paginated). MANAGER is scoped to own units; role=CUSTOMER is effectively ADMIN-only.',
  })
  @ApiOkResponse({ type: PaginatedUserResponseDto })
  @ApiNotFoundResponse({ description: 'MANAGER requested a unit outside their scope' })
  async list(
    @CurrentUser() actor: JwtPayload,
    @Query() query: ListUsersQueryDto,
  ): Promise<PaginatedResponseDto<UserResponseDto>> {
    const limit = sanitizeLimit(query.limit);
    const result = await this.listUsers.execute({
      actor: { role: actor.role, businessUnitIds: actor.businessUnitIds },
      businessUnitId: query.businessUnitId,
      username: query.username,
      email: query.email,
      role: query.role,
      cursor: query.cursor,
      limit,
    });
    return new PaginatedResponseDto(
      result.data.map((user) => UserResponseDto.fromEntity(user)),
      result.meta,
    );
  }

  // Declared before any :id route so NestJS matches /lookup literally, not as a UUID
  // param. KITCHEN is excluded on purpose, mirroring ATTENDING_ROLES in the orders
  // controller: only roles that actually serve customers need to resolve one.
  // Rate-limited despite being an exact match, because a hit/miss still answers
  // "is this phone registered?" one guess at a time.
  @Roles(['ADMIN', 'MANAGER', 'ATTENDANT'])
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @Get('lookup')
  @ApiOperation({
    summary: 'Find a customer by exact phone or email, to bind to a counter order',
    description:
      'Send exactly one of phone or email - neither or both is a 400. Matching is exact, ' +
      'never partial, so this cannot be used to browse customers. A value that belongs to ' +
      'a staff or deactivated account is reported as not found, same as an unknown one.',
  })
  @ApiOkResponse({ type: CustomerLookupResponseDto })
  @ApiBadRequestResponse({ description: 'Neither or both of phone/email were provided' })
  @ApiForbiddenResponse({ description: 'Your role may not look up customers' })
  @ApiNotFoundResponse({ description: 'No active customer matches that contact value' })
  async lookup(@Query() query: LookupCustomerQueryDto): Promise<CustomerLookupResponseDto> {
    const user = await this.lookupCustomer.execute({ phone: query.phone, email: query.email });
    return CustomerLookupResponseDto.fromEntity(user);
  }

  // Declared before any :id route so NestJS matches /me literally, not as a UUID
  // param. Open to any authenticated role: everyone may read their own record.
  @Get('me')
  @ApiOperation({ summary: 'Get own account info' })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiNotFoundResponse({ description: 'Authenticated user not found' })
  async me(@CurrentUser() actor: JwtPayload): Promise<UserResponseDto> {
    const user = await this.getMyProfile.execute(actor.sub);
    return UserResponseDto.fromEntity(user);
  }

  // Declared before any :id route so NestJS matches /me literally, not as a UUID param.
  // Dedicated limit to slow phone-enumeration via repeated profile patches.
  @Roles(['CUSTOMER'])
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @Patch('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update own name and/or phone (customers only)' })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiConflictResponse({ description: 'Phone already in use by another account' })
  @ApiNotFoundResponse({ description: 'Authenticated user not found' })
  async updateMe(
    @CurrentUser() actor: JwtPayload,
    @Body() body: UpdateMyProfileDto,
  ): Promise<UserResponseDto> {
    const user = await this.updateUserProfile.execute(actor.sub, body);
    return UserResponseDto.fromEntity(user);
  }

  // Declared before any :id route so /me/password matches literally. Stricter
  // limit than the global one to slow online guessing against currentPassword.
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Patch('me/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Change own password' })
  @ApiNoContentResponse({ description: 'Password changed; all sessions revoked' })
  @ApiUnauthorizedResponse({ description: 'Current password is incorrect' })
  @ApiUnprocessableEntityResponse({ description: 'New password equals the current one' })
  @ApiNotFoundResponse({ description: 'Authenticated user not found' })
  async changeMyPassword(
    @CurrentUser() actor: JwtPayload,
    @Body() body: ChangeMyPasswordDto,
  ): Promise<void> {
    await this.changePassword.execute(actor.sub, body);
  }

  @Roles(['ADMIN', 'MANAGER'])
  @Patch(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate a user (sets is_active=false)' })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiForbiddenResponse({
    description: 'Your role may not deactivate that user, or it is yourself',
  })
  @ApiNotFoundResponse({ description: 'User not found' })
  async deactivate(
    @CurrentUser() actor: JwtPayload,
    @Param() { id }: UserIdParamDto,
  ): Promise<UserResponseDto> {
    const user = await this.deactivateUser.execute(
      { id: actor.sub, role: actor.role, businessUnitIds: actor.businessUnitIds },
      id,
    );
    return UserResponseDto.fromEntity(user);
  }

  @Roles(['ADMIN', 'MANAGER'])
  @Patch(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reactivate a user (sets is_active=true)' })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiForbiddenResponse({ description: 'Your role may not reactivate that user' })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiConflictResponse({ description: 'User state changed during reactivation; please retry' })
  async reactivate(
    @CurrentUser() actor: JwtPayload,
    @Param() { id }: UserIdParamDto,
  ): Promise<UserResponseDto> {
    const user = await this.reactivateUser.execute(
      { id: actor.sub, role: actor.role, businessUnitIds: actor.businessUnitIds },
      id,
    );
    return UserResponseDto.fromEntity(user);
  }

  @Roles(['ADMIN'])
  @Put(':id/business-units')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Replace a staff user's business-unit scope (admin only)" })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiForbiddenResponse({
    description: 'Only ADMIN may change scope, or the target is unit-unbound',
  })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiUnprocessableEntityResponse({ description: 'One or more business units do not exist' })
  async setBusinessUnits(
    @CurrentUser() actor: JwtPayload,
    @Param() { id }: UserIdParamDto,
    @Body() body: UpdateUserBusinessUnitsDto,
  ): Promise<UserResponseDto> {
    const user = await this.updateUserBusinessUnits.execute(
      { id: actor.sub, role: actor.role },
      id,
      body.businessUnitIds,
    );
    return UserResponseDto.fromEntity(user);
  }
}
