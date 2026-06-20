import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { detectClient } from './client-detection';

// Access log. We log on res 'finish' instead of right after next() because by
// then the guards have run (so req.user is populated) and the status code and
// total duration are known. We only record transport metadata. Never log the
// Authorization header, request body, passwords, cpf or tokens.
@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RequestLoggingMiddleware.name);

  use(req: Request, res: Response, next: NextFunction): void {
    const startNs = process.hrtime.bigint();

    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startNs) / 1_000_000;
      const { client, raw } = detectClient(req.headers['user-agent']);

      // Strip the query string and log only the pathname. The query can carry
      // tokens, cpf or email and the access log must never persist those.
      const path = (req.originalUrl ?? req.url ?? '').split('?')[0];

      const entry = {
        method: req.method,
        path,
        statusCode: res.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
        ip: req.ip,
        client,
        userAgent: raw,
        userId: req.user?.sub,
      };

      if (res.statusCode >= 500) {
        this.logger.error(entry);
      } else if (res.statusCode >= 400) {
        this.logger.warn(entry);
      } else {
        this.logger.log(entry);
      }
    });

    next();
  }
}
