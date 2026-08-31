/** /v1/trace 审计日志查询路由 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { auditLogger } from '../core/AuditLogger.ts';

const router: Router = Router();

/** GET /v1/trace — 返回内存中的审计日志列表 */
router.get('/v1/trace', (req: Request, res: Response) => {
  const traces = auditLogger.getTraces();

  // 支持可选的 ?limit=N 参数，限制返回条数
  const limit = req.query.limit ? Number(req.query.limit) : undefined;
  const result = limit && limit > 0 ? traces.slice(-limit) : traces;

  res.json({
    total: traces.length,
    returned: result.length,
    traces: result,
  });
});

/** DELETE /v1/trace — 清空内存中的审计日志 */
router.delete('/v1/trace', (_req: Request, res: Response) => {
  auditLogger.clearTraces();
  res.json({ message: 'traces cleared' });
});

export default router;
