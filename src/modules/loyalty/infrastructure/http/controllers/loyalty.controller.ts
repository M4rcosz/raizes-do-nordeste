import { Controller, Delete, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '@shared/auth/roles.decorator';
import { CurrentUser } from '@shared/auth/current-user.decorator';
import type { JwtPayload } from '@shared/auth/jwt-payload.type';
import { UserRole } from '@modules/identity/domain/value-objects/user-role';
import { GetMyLoyaltyAccountUseCase } from '@modules/loyalty/application/use-cases/get-my-loyalty-account.use-case';
import { GiveLoyaltyConsentUseCase } from '@modules/loyalty/application/use-cases/give-loyalty-consent.use-case';
import { RevokeLoyaltyConsentUseCase } from '@modules/loyalty/application/use-cases/revoke-loyalty-consent.use-case';
import { LoyaltyAccountResponseDto } from '../dto/loyalty-account-response.dto';

@ApiTags('loyalty')
@ApiBearerAuth()
@Controller('loyalty')
export class LoyaltyController {
  constructor(
    private readonly getMyAccount: GetMyLoyaltyAccountUseCase,
    private readonly giveConsent: GiveLoyaltyConsentUseCase,
    private readonly revokeConsent: RevokeLoyaltyConsentUseCase,
  ) {}

  @Get('me')
  @Roles([UserRole.CUSTOMER])
  @ApiOperation({ summary: 'Get the authenticated customer loyalty account.' })
  @ApiOkResponse({ type: LoyaltyAccountResponseDto })
  @ApiNotFoundResponse({ description: 'No account yet - created on the first order.' })
  async me(@CurrentUser() user: JwtPayload): Promise<LoyaltyAccountResponseDto> {
    const account = await this.getMyAccount.execute(user.sub);
    return LoyaltyAccountResponseDto.fromEntity(account);
  }

  @Post('me/consent')
  @Roles([UserRole.CUSTOMER])
  // Idempotent upsert: granting consent creates the account if absent or refreshes
  // it, so 200 (not 201) regardless of whether a row was inserted.
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Grant LGPD consent for the loyalty program (LGPD).' })
  @ApiOkResponse({ type: LoyaltyAccountResponseDto })
  async grantConsentRoute(@CurrentUser() user: JwtPayload): Promise<LoyaltyAccountResponseDto> {
    const account = await this.giveConsent.execute(user.sub);
    return LoyaltyAccountResponseDto.fromEntity(account);
  }

  @Delete('me/consent')
  @Roles([UserRole.CUSTOMER])
  @ApiOperation({ summary: 'Withdraw LGPD consent for the loyalty program (LGPD).' })
  @ApiOkResponse({ type: LoyaltyAccountResponseDto })
  @ApiNotFoundResponse({ description: 'No account yet - nothing to withdraw consent from.' })
  async revokeConsentRoute(@CurrentUser() user: JwtPayload): Promise<LoyaltyAccountResponseDto> {
    const account = await this.revokeConsent.execute(user.sub);
    return LoyaltyAccountResponseDto.fromEntity(account);
  }
}
