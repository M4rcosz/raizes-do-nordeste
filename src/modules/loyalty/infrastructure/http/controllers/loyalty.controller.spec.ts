import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Reflector } from '@nestjs/core';
import { LoyaltyController } from './loyalty.controller';
import { LoyaltyAccountResponseDto } from '../dto/loyalty-account-response.dto';
import { IS_PUBLIC_KEY } from '@shared/auth/public.decorator';
import { Roles } from '@shared/auth/roles.decorator';
import type { JwtPayload } from '@shared/auth/jwt-payload.type';
import { UserRole } from '@modules/identity/domain/value-objects/user-role';
import { LoyaltyAccount } from '@modules/loyalty/domain/entities/loyalty-account.entity';
import { GetMyLoyaltyAccountUseCase } from '@modules/loyalty/application/use-cases/get-my-loyalty-account.use-case';
import { GiveLoyaltyConsentUseCase } from '@modules/loyalty/application/use-cases/give-loyalty-consent.use-case';
import { RevokeLoyaltyConsentUseCase } from '@modules/loyalty/application/use-cases/revoke-loyalty-consent.use-case';

// Use cases are faked at their `execute` boundary. `unknown` args keep the fake
// assignable to every use-case signature without `never` poisoning the arg types.
type Fn = jest.MockedFunction<(...args: unknown[]) => Promise<unknown>>;

const useCase = (): { execute: Fn } => ({ execute: jest.fn() as Fn });

const account = new LoyaltyAccount(
  'la-1',
  'c-1',
  42,
  true,
  new Date('2026-01-01T00:00:00Z'),
  null,
  new Date('2026-01-01T00:00:00Z'),
  new Date('2026-01-02T00:00:00Z'),
);

const CUSTOMER = {
  sub: 'c-1',
  username: 'ana',
  role: UserRole.CUSTOMER,
  businessUnitIds: [],
  iat: 0,
  exp: 0,
} as JwtPayload;

describe('LoyaltyController', () => {
  let getMyAccount: { execute: Fn };
  let giveConsent: { execute: Fn };
  let revokeConsent: { execute: Fn };
  let controller: LoyaltyController;

  beforeEach(() => {
    getMyAccount = useCase();
    giveConsent = useCase();
    revokeConsent = useCase();

    controller = new LoyaltyController(
      getMyAccount as unknown as GetMyLoyaltyAccountUseCase,
      giveConsent as unknown as GiveLoyaltyConsentUseCase,
      revokeConsent as unknown as RevokeLoyaltyConsentUseCase,
    );
  });

  // These routes read and mutate LGPD consent. None of them may be reachable
  // without a token, and only the customer themself may drive them.
  describe('route gating', () => {
    const reflector = new Reflector();

    it.each([
      ['me', LoyaltyController.prototype.me],
      ['grantConsentRoute', LoyaltyController.prototype.grantConsentRoute],
      ['revokeConsentRoute', LoyaltyController.prototype.revokeConsentRoute],
    ])('gates %s behind CUSTOMER and never exposes it publicly', (_name, handler) => {
      expect(reflector.get(Roles, handler)).toEqual([UserRole.CUSTOMER]);
      expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler)).toBeUndefined();
    });
  });

  // The account is always resolved from the token subject. There is no route param
  // or body field to tamper with, and that is the property worth pinning down.
  describe('account is resolved from the token subject', () => {
    it('me reads the caller own account', async () => {
      getMyAccount.execute.mockResolvedValue(account);

      const result = await controller.me(CUSTOMER);

      expect(getMyAccount.execute).toHaveBeenCalledWith('c-1');
      expect(result).toBeInstanceOf(LoyaltyAccountResponseDto);
      expect(result.customerId).toBe('c-1');
      expect(result.totalPoints).toBe(42);
    });

    it('grantConsentRoute consents on behalf of the caller only', async () => {
      giveConsent.execute.mockResolvedValue(account);

      const result = await controller.grantConsentRoute(CUSTOMER);

      expect(giveConsent.execute).toHaveBeenCalledWith('c-1');
      expect(result.consentGiven).toBe(true);
    });

    it('revokeConsentRoute withdraws for the caller only', async () => {
      const revoked = new LoyaltyAccount(
        'la-1',
        'c-1',
        42,
        false,
        new Date('2026-01-01T00:00:00Z'),
        new Date('2026-02-01T00:00:00Z'),
        new Date('2026-01-01T00:00:00Z'),
        new Date('2026-02-01T00:00:00Z'),
      );
      revokeConsent.execute.mockResolvedValue(revoked);

      const result = await controller.revokeConsentRoute(CUSTOMER);

      expect(revokeConsent.execute).toHaveBeenCalledWith('c-1');
      expect(result.consentGiven).toBe(false);
      expect(result.consentRevokedAt).toEqual(new Date('2026-02-01T00:00:00Z'));
    });
  });
});
