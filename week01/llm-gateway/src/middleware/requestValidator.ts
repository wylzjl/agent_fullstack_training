/** 请求参数校验中间件 */

import type { Request, Response, NextFunction } from 'express';
import { LLMRequestSchema } from '../types/schemas.ts';
import type { LLMRequest } from '../types/index.ts';
import { ErrorCode } from '../errors/index.ts';

/** 扩展 Express Request，携带校验后的请求数据 */
declare global {
  namespace Express {
    interface Request {
      validatedRequest: LLMRequest;
    }
  }
}

/** 创建请求校验中间件，isStream 标记用于流式端点额外校验 */
export function createRequestValidator(isStream = false) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // 流式端点额外校验：responseSchema 必须为 null
      if (isStream && req.body?.responseSchema != null) {
        res.status(400).json({
          error: {
            code: ErrorCode.INVALID_REQUEST,
            message: '流式端点不支持 responseSchema',
            requestId: req.requestId,
          },
        });
        return;
      }

      const parsed = LLMRequestSchema.parse(req.body);
      req.validatedRequest = parsed;
      next();
    } catch (err) {
      const message = err instanceof Error ? err.message : '请求参数校验失败';
      res.status(400).json({
        error: {
          code: ErrorCode.INVALID_REQUEST,
          message,
          requestId: req.requestId,
        },
      });
    }
  };
}
