import { Controller, Get } from '@nestjs/common';
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
import { LoyaltyAccountResponseDto } from '../dto/loyalty-account-response.dto';

@ApiTags('loyalty')
@ApiBearerAuth()
@Controller('loyalty')
export class LoyaltyController {
  constructor(private readonly getMyAccount: GetMyLoyaltyAccountUseCase) {}

  @Get('me')
  @Roles([UserRole.CUSTOMER])
  @ApiOperation({ summary: 'Get the authenticated customer loyalty account.' })
  @ApiOkResponse({ type: LoyaltyAccountResponseDto })
  @ApiNotFoundResponse({ description: 'No account yet - created on the first order.' })
  async me(@CurrentUser() user: JwtPayload): Promise<LoyaltyAccountResponseDto> {
    const account = await this.getMyAccount.execute(user.sub);
    return LoyaltyAccountResponseDto.fromEntity(account);
  }
}
