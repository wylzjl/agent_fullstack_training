/** 请求 ID 注入中间件 */

import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

/** 扩展 Express Request 类型 */
declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

export function requestIdMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const headerId = req.headers['x-request-id'];
  req.requestId = (typeof headerId === 'string' && headerId.length > 0)
    ? headerId
    : randomUUID();
  next();
}
