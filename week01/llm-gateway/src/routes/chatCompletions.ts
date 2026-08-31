/** /v1/chat/completions 路由 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { Gateway } from '../core/Gateway.ts';
import { createRequestValidator } from '../middleware/requestValidator.ts';
import { ErrorCode } from '../errors/index.ts';

const router: Router = Router();
const gateway = new Gateway();

/** 非流式：POST /v1/chat/completions */
router.post('/v1/chat/completions', createRequestValidator(false), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const response = await gateway.execute(req.validatedRequest, req.requestId);
    res.json(response);
  } catch (err) {
    next(err);
  }
});

/** 流式：POST /v1/chat/completions/stream */
router.post('/v1/chat/completions/stream', createRequestValidator(true), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { model, iterator, getUsage, onEnd, onError } = await gateway.executeStream(req.validatedRequest, req.requestId);

    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    // 立即发送响应头，建立 SSE 连接
    res.flushHeaders();

    let clientDisconnected = false;

    // 监听客户端断开
    req.on('close', () => {
      clientDisconnected = true;
      onError(ErrorCode.CLIENT_DISCONNECTED);
    });

    // 迭代流式数据
    for await (const chunk of iterator) {
      if (clientDisconnected) break;
      
      const event = {
        requestId: req.requestId,
        model,
        type: chunk.type,
        delta: chunk.text,
        done: false,
      };
      res.write(`data: ${JSON.stringify(event)}\n\n`);
      // 如果存在 flush 方法（如 compression 中间件），立即刷新
      if (typeof (res as any).flush === 'function') {
        (res as any).flush();
      }
    }

    // 发送结束事件
    if (!clientDisconnected) {
      const usage = getUsage();
      const endEvent = {
        requestId: req.requestId,
        model,
        delta: '',
        done: true,
        usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens },
      };
      res.write(`data: ${JSON.stringify(endEvent)}\n\n`);
      res.end();

      onEnd();
    }
  } catch (err) {
    next(err);
  }
});

export default router;
