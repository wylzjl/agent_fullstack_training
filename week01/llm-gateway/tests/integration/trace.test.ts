import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../src/app.ts';
import { auditLogger } from '../../src/core/AuditLogger.ts';
import type { CallTrace } from '../../src/types/index.ts';

const mockTrace: CallTrace = {
  requestId: 'trace-test-1',
  timestamp: new Date().toISOString(),
  requestedModel: 'general-primary',
  actualModel: 'general-primary',
  promptName: null,
  promptVersion: null,
  inputTokens: 10,
  outputTokens: 20,
  costUsd: 0,
  ttftMs: 0,
  latencyMs: 500,
  attempts: 1,
  status: 'success',
  errorCode: null,
};

describe('/v1/trace', () => {
  beforeEach(() => {
    auditLogger.clearTraces();
  });

  describe('GET /v1/trace', () => {
    it('返回审计日志列表', async () => {
      auditLogger.log(mockTrace);

      const res = await request(app).get('/v1/trace');

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.returned).toBe(1);
      expect(res.body.traces).toHaveLength(1);
      expect(res.body.traces[0].requestId).toBe('trace-test-1');
    });

    it('空日志返回空列表', async () => {
      const res = await request(app).get('/v1/trace');

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(0);
      expect(res.body.traces).toHaveLength(0);
    });

    it('limit 参数限制返回条数', async () => {
      for (let i = 0; i < 10; i++) {
        auditLogger.log({ ...mockTrace, requestId: `trace-${i}` });
      }

      const res = await request(app).get('/v1/trace?limit=5');

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(10);
      expect(res.body.returned).toBe(5);
      expect(res.body.traces).toHaveLength(5);
    });
  });

  describe('DELETE /v1/trace', () => {
    it('清空审计日志', async () => {
      auditLogger.log(mockTrace);
      auditLogger.log({ ...mockTrace, requestId: 'another' });

      const deleteRes = await request(app).delete('/v1/trace');
      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.message).toBe('traces cleared');

      const getRes = await request(app).get('/v1/trace');
      expect(getRes.body.total).toBe(0);
    });
  });
});
