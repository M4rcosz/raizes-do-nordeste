import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '@shared/auth/roles.decorator';
import { CurrentUser } from '@shared/auth/current-user.decorator';
import type { JwtPayload } from '@shared/auth/jwt-payload.type';
import { UserRole } from '@modules/identity/domain/value-objects/user-role';
import { GetMyAiMembershipUseCase } from '@modules/ai/application/use-cases/get-my-ai-membership.use-case';
import { EnrollAiMembershipUseCase } from '@modules/ai/application/use-cases/enroll-ai-membership.use-case';
import { AdjustAiMembershipBalanceUseCase } from '@modules/ai/application/use-cases/adjust-ai-membership-balance.use-case';
import { AiMembershipUserParamDto } from '../dto/ai-membership-user-param.dto';
import { EnrollAiMembershipDto } from '../dto/enroll-ai-membership.dto';
import { AdjustAiMembershipBalanceDto } from '../dto/adjust-ai-membership-balance.dto';
import { AiMembershipResponseDto } from '../dto/ai-membership-response.dto';

// Membership is per-user and global (not scoped to a business unit), so no
// UnitScopeGuard here - enroll/adjust are ADMIN-only, the read is self-service.
// TODO(test): route wiring (roles, param binding) covered by e2e once migrated.
@ApiTags('ai')
@ApiBearerAuth()
@Controller('ai/memberships')
export class AiMembershipController {
  constructor(
    private readonly getMyMembership: GetMyAiMembershipUseCase,
    private readonly enrollMembership: EnrollAiMembershipUseCase,
    private readonly adjustBalance: AdjustAiMembershipBalanceUseCase,
  ) {}

  // Declared before :userId so the literal path is not captured by the param route.
  @Get('me')
  @ApiOperation({ summary: 'Get the authenticated user AI token membership.' })
  @ApiOkResponse({ type: AiMembershipResponseDto })
  @ApiNotFoundResponse({ description: 'No membership yet - an admin must enroll you.' })
  async me(@CurrentUser() user: JwtPayload): Promise<AiMembershipResponseDto> {
    const membership = await this.getMyMembership.execute(user.sub);
    return AiMembershipResponseDto.fromEntity(membership);
  }

  @Post(':userId')
  @Roles([UserRole.ADMIN])
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a user AI token membership with an initial balance. Admins only.',
  })
  @ApiCreatedResponse({ type: AiMembershipResponseDto })
  @ApiConflictResponse({ description: 'User already has an AI membership.' })
  async enroll(
    @Param() { userId }: AiMembershipUserParamDto,
    @Body() body: EnrollAiMembershipDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<AiMembershipResponseDto> {
    const membership = await this.enrollMembership.execute({
      userId,
      initialBalance: body.initialBalance,
      actorId: user.sub,
    });
    return AiMembershipResponseDto.fromEntity(membership);
  }

  @Patch(':userId/balance')
  @Roles([UserRole.ADMIN])
  @ApiOperation({ summary: 'Credit or debit a user AI token balance. Admins only.' })
  @ApiOkResponse({ type: AiMembershipResponseDto })
  @ApiNotFoundResponse({ description: 'User has no AI membership.' })
  async adjust(
    @Param() { userId }: AiMembershipUserParamDto,
    @Body() body: AdjustAiMembershipBalanceDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<AiMembershipResponseDto> {
    const membership = await this.adjustBalance.execute({
      userId,
      delta: body.delta,
      actorId: user.sub,
    });
    return AiMembershipResponseDto.fromEntity(membership);
  }
}
