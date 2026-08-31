/** 全局错误处理中间件 */

import type { Request, Response, NextFunction } from 'express';
import { GatewayError, ErrorCode, ERROR_HTTP_STATUS } from '../errors/index.ts';

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  const requestId = req.requestId ?? 'unknown';

  if (err instanceof GatewayError) {
    res.status(err.httpStatus).json({
      error: {
        code: err.code,
        message: err.message,
        requestId,
      },
    });
    return;
  }

  // ZodError 或其他未知错误
  console.error('[ErrorHandler]', err);
  res.status(500).json({
    error: {
      code: ErrorCode.INTERNAL_ERROR,
      message: err.message || '网关内部错误',
      requestId,
    },
  });
}
