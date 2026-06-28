import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { JwtTokenSigner } from './jwt-token-signer';
import { JwtPayloadSign } from '@shared/auth/jwt-payload.type';

describe('JwtTokenSigner', () => {
  let signer: JwtTokenSigner;
  let signAsync: jest.MockedFunction<(payload: JwtPayloadSign) => Promise<string>>;

  beforeAll(async () => {
    signAsync = jest.fn() as jest.MockedFunction<(payload: JwtPayloadSign) => Promise<string>>;
    const jwtServiceMock = { signAsync } as unknown as JwtService;

    const moduleRef = await Test.createTestingModule({
      providers: [JwtTokenSigner, { provide: JwtService, useValue: jwtServiceMock }],
    }).compile();

    signer = moduleRef.get(JwtTokenSigner);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('sign', () => {
    it('should delegate to JwtService.signAsync with the payload and return its result', async () => {
      signAsync.mockResolvedValue('signed.jwt.token');
      const payload: JwtPayloadSign = {
        sub: 'user-1',
        username: 'panic',
        role: 'KITCHEN',
        businessUnitId: 'bu-1',
      };

      const token = await signer.sign(payload);

      expect(signAsync).toHaveBeenCalledWith(payload);
      expect(token).toBe('signed.jwt.token');
    });
  });
});
