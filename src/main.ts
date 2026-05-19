import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from './app.module';

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
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');
  app.enableCors(); // TODO: Configure CORS properly for production
  app.enableShutdownHooks();

  const port = Number(process.env.PORT) || 3000;

  const configService = app.get(ConfigService);
  const isProduction = configService.get<string>('NODE_ENV') === 'production';

  if (!isProduction) {
    const config = new DocumentBuilder()
      .setTitle('Raízes do Nordeste')
      .setDescription('Multi-unit restaurant management API for Raízes do Nordeste')
      .setVersion(readAppVersion())
      .addBearerAuth()
      .build();

    const documentFactory = (): ReturnType<typeof SwaggerModule.createDocument> =>
      SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, documentFactory, { useGlobalPrefix: true });

    logger.log(`Swagger UI available at http://localhost:${port}/api/docs`);
  }

  await app.listen(port);

  logger.log(`Application running on http://localhost:${port}/api`);
}

void bootstrap();
