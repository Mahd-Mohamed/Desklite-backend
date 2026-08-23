import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Reflector } from '@nestjs/core';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: true,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new TransformInterceptor(new Reflector()));
  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`🚀 Backend running on http://localhost:${port}`);
}
bootstrap();
