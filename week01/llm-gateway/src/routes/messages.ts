/** /v1/messages 路由 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { Gateway } from '../core/Gateway.ts';
import { createRequestValidator } from '../middleware/requestValidator.ts';
import { ErrorCode } from '../errors/index.ts';

const router: Router = Router();
const gateway = new Gateway();

/** 非流式：POST /v1/messages */
router.post('/v1/messages', createRequestValidator(false), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const response = await gateway.execute(req.validatedRequest, req.requestId);
    res.json(response);
  } catch (err) {
    next(err);
  }
});

/** 流式：POST /v1/messages/stream */
router.post('/v1/messages/stream', createRequestValidator(true), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { model, iterator, getUsage, onEnd, onError } = await gateway.executeStream(req.validatedRequest, req.requestId);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    let clientDisconnected = false;

    req.on('close', () => {
      clientDisconnected = true;
      onError(ErrorCode.CLIENT_DISCONNECTED);
    });

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
      if (typeof (res as any).flush === 'function') {
        (res as any).flush();
      }
    }

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
