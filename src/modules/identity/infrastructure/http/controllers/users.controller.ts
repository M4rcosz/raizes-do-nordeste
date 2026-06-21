import { Body, Controller, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CreateUserUseCase } from '@modules/identity/application/use-cases/create-user.use-case';
import { DeactivateUserUseCase } from '@modules/identity/application/use-cases/deactivate-user.use-case';
import { RegisterCustomerUseCase } from '@modules/identity/application/use-cases/register-customer.use-case';
import { CurrentUser } from '@shared/auth/current-user.decorator';
import type { JwtPayload } from '@shared/auth/jwt-payload.type';
import { Public } from '@shared/auth/public.decorator';
import { Roles } from '@shared/auth/roles.decorator';
import { CreateUserDto } from '../dto/create-user-request.dto';
import { RegisterCustomerDto } from '../dto/register-customer-request.dto';
import { UserIdParamDto } from '../dto/user-params.dto';
import { UserResponseDto } from '../dto/user-response.dto';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly registerCustomer: RegisterCustomerUseCase,
    private readonly createUser: CreateUserUseCase,
    private readonly deactivateUser: DeactivateUserUseCase,
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
}
