import { createParamDecorator, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { JwtPayload } from './jwt-payload.type';

/**
 * Reads the authenticated principal that {@link AuthGuard} attaches to the
 * request after verifying the JWT. Throws if it is absent - that means the
 * route ran without the guard (e.g. it is @Public), which is a programming
 * error for any handler asking for the current user.
 */
export const currentUserFactory = (_data: unknown, context: ExecutionContext): JwtPayload => {
  const request = context.switchToHttp().getRequest<Request>();
  const user = request.user;

  if (!user) {
    throw new UnauthorizedException();
  }

  return user;
};

export const CurrentUser = createParamDecorator(currentUserFactory);
