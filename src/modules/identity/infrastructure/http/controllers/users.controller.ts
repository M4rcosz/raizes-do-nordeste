import { Body, Controller, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import {
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
import { ReactivateUserUseCase } from '@modules/identity/application/use-cases/reactivate-user.use-case';
import { RegisterCustomerUseCase } from '@modules/identity/application/use-cases/register-customer.use-case';
import { UpdateUserProfileUseCase } from '@modules/identity/application/use-cases/update-user-profile.use-case';
import { CurrentUser } from '@shared/auth/current-user.decorator';
import type { JwtPayload } from '@shared/auth/jwt-payload.type';
import { Public } from '@shared/auth/public.decorator';
import { Roles } from '@shared/auth/roles.decorator';
import { ChangeMyPasswordDto } from '../dto/change-my-password-request.dto';
import { CreateUserDto } from '../dto/create-user-request.dto';
import { RegisterCustomerDto } from '../dto/register-customer-request.dto';
import { UpdateMyProfileDto } from '../dto/update-my-profile-request.dto';
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
    private readonly changePassword: ChangePasswordUseCase,
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
    const user = await this.createUser.execute({ id: actor.sub, role: actor.role }, body);
    return UserResponseDto.fromEntity(user);
  }

  // Declared before any :id route so NestJS matches /me literally, not as a UUID param.
  // Dedicated limit to slow phone-enumeration via repeated profile patches.
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @Patch('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update own name and/or phone' })
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
    const user = await this.deactivateUser.execute({ id: actor.sub, role: actor.role }, id);
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
    const user = await this.reactivateUser.execute({ id: actor.sub, role: actor.role }, id);
    return UserResponseDto.fromEntity(user);
  }
}
