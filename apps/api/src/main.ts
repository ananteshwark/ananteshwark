import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe, Logger, ClassSerializerInterceptor } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // Fail closed: never boot production signing tokens with a missing or
  // well-known default secret (an attacker who knows the default can forge a
  // token for any user/tenant). Dev/test keep their fallbacks for convenience.
  if (configService.get('APP_ENV') === 'production') {
    const insecure = new Set(['', 'default-secret', 'refresh-secret']);
    for (const key of ['JWT_SECRET', 'JWT_REFRESH_SECRET']) {
      const value = configService.get<string>(key);
      if (!value || insecure.has(value)) {
        throw new Error(
          `${key} is missing or set to an insecure default; refusing to start in production. ` +
            `Set it to a strong random value (openssl rand -hex 32).`,
        );
      }
    }
  }

  // CORS
  const allowedOrigins = configService.get('ALLOWED_ORIGINS', 'http://localhost:5173');
  app.enableCors({
    origin: allowedOrigins.split(','),
    credentials: true,
  });

  // Global pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      // Do not 403/400 on extra properties: controllers bind the whole query
      // string to PaginationDto via @Query() while also reading sibling filter
      // params (search/type/status/...). forbidNonWhitelisted would reject those.
      forbidNonWhitelisted: false,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global interceptors and filters
  app.useGlobalInterceptors(
    new ClassSerializerInterceptor(app.get(Reflector)),
    new ResponseInterceptor(),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  // Swagger
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Enterprise ERP API')
    .setDescription('Multi-tenant Enterprise ERP Platform API')
    .setVersion('1.0')
    .addBearerAuth()
    .addApiKey({ type: 'apiKey', name: 'X-Tenant-ID', in: 'header' }, 'tenant-id')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  // Prefer PORT (the convention most PaaS platforms inject) and fall back to
  // APP_PORT, then 3000. Binding to 0.0.0.0 keeps the container reachable from
  // the Docker network / platform proxy rather than only loopback.
  const port = configService.get('PORT') ?? configService.get('APP_PORT', 3000);
  await app.listen(port, '0.0.0.0');
  logger.log(`Application running on port ${port}`);
  logger.log(`Swagger docs: http://localhost:${port}/api/docs`);
}
bootstrap();
