import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from './app.module';
import { parseCorsOrigins, parseTrustProxy } from '@shared/config/env';

function readAppVersion(): string {
  const raw: unknown = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));
  if (
    raw !== null &&
    typeof raw === 'object' &&
    'version' in raw &&
    typeof raw.version === 'string'
  ) {
    return raw.version;
  }
  return '0.0.0';
}

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.setGlobalPrefix('api');
  // CORS_ORIGINS is a comma-separated allowlist. Unset reflects any origin
  // (dev default); set in production to the front-end origin(s), e.g. the
  // Vercel domain. credentials: true lets the browser send/receive the
  // httpOnly refresh cookie cross-origin (origin stays a specific reflection,
  // which is required alongside credentials).
  const corsOrigins = parseCorsOrigins(process.env.CORS_ORIGINS);
  // Fail closed in production: reflecting any origin together with credentials
  // would let any site make credentialed calls and read the response, so an
  // unset allowlist crashes the boot instead of silently opening up.
  if (process.env.NODE_ENV === 'production' && corsOrigins === true) {
    throw new Error(
      'CORS_ORIGINS must be set in production: credentialed CORS cannot reflect any origin.',
    );
  }
  app.enableCors({ origin: corsOrigins, credentials: true });
  app.enableShutdownHooks();

  // Trust proxy is off by default. Enable it ONLY when a trusted reverse proxy
  // sits in front of us, otherwise a client can spoof X-Forwarded-For and forge
  // its IP, which would poison the access log and the rate limiter tracker.
  // TRUST_PROXY accepts 'true'/'false' or a number of trusted hops. A present
  // but invalid value throws here and crashes the boot instead of silently
  // leaving the proxy untrusted.
  if (process.env.TRUST_PROXY !== undefined) {
    app.set('trust proxy', parseTrustProxy(process.env.TRUST_PROXY));
  }

  const port = Number(process.env.PORT) || 3000;

  // Swagger is intentionally exposed in every environment, production included,
  // so the API stays self-documenting for this portfolio project.
  const config = new DocumentBuilder()
    .setTitle('Nexio')
    .setDescription('Multi-unit restaurant management API for Nexio')
    .setVersion(readAppVersion())
    .addBearerAuth()
    .build();

  const documentFactory = (): ReturnType<typeof SwaggerModule.createDocument> =>
    SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, documentFactory, { useGlobalPrefix: true });

  logger.log(`Swagger UI available at /api/docs`);

  await app.listen(port);

  logger.log(`Application running on http://localhost:${port}/api`);
}

void bootstrap();
