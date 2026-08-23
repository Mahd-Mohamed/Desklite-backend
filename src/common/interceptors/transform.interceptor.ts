import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, map } from 'rxjs';
import { ApiResponse } from '../interfaces/api-response.interface';
import { SUCCESS_MESSAGE_KEY } from '../decorators/success-message.decorator';

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T>> {
    const message =
      this.reflector.get<string>(SUCCESS_MESSAGE_KEY, context.getHandler()) ||
      'Request successful';

    return next.handle().pipe(
      map((data) => ({
        success: true,
        message,
        data: data ?? null,
      })),
    );
  }
}
