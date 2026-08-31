import { describe, it, expect, vi } from 'vitest';
import { errorHandler } from '../../../src/middleware/errorHandler.ts';
import { GatewayError } from '../../../src/errors/index.ts';
import type { Request, Response, NextFunction } from 'express';

function createMockReq(requestId = 'test-req-id'): Request {
  return { requestId } as unknown as Request;
}

function createMockRes(): Response & { _status: number; _json: unknown } {
  const res: any = {
    _status: 200,
    _json: null,
    status(code: number) {
      res._status = code;
      return res;
    },
    json(data: unknown) {
      res._json = data;
      return res;
    },
  };
  return res as any;
}

describe('errorHandler', () => {
  const next = vi.fn() as NextFunction;

  it('GatewayError 映射为对应 HTTP 状态码和 JSON', () => {
    const testCases = [
      { error: GatewayError.invalidRequest('bad'), status: 400, code: 'INVALID_REQUEST' },
      { error: new GatewayError('AUTH_FAILED', 401, 'unauthorized'), status: 401, code: 'AUTH_FAILED' },
      { error: GatewayError.rateLimited(5), status: 429, code: 'RATE_LIMITED' },
      { error: GatewayError.modelUnavailable(), status: 503, code: 'MODEL_UNAVAILABLE' },
      { error: GatewayError.timeout(), status: 504, code: 'TIMEOUT' },
      { error: GatewayError.internal(), status: 500, code: 'INTERNAL_ERROR' },
    ];

    for (const { error, status, code } of testCases) {
      const req = createMockReq();
      const res = createMockRes();

      errorHandler(error, req, res as unknown as Response, next);

      expect(res._status).toBe(status);
      expect((res._json as any).error.code).toBe(code);
    }
  });

  it('未知错误返回 500 INTERNAL_ERROR', () => {
    const req = createMockReq();
    const res = createMockRes();
    const error = new Error('something unexpected');

    errorHandler(error, req, res as unknown as Response, next);

    expect(res._status).toBe(500);
    expect((res._json as any).error.code).toBe('INTERNAL_ERROR');
    expect((res._json as any).error.message).toBe('something unexpected');
  });

  it('响应包含 requestId', () => {
    const req = createMockReq('my-request-id');
    const res = createMockRes();
    const error = GatewayError.internal('test');

    errorHandler(error, req, res as unknown as Response, next);

    expect((res._json as any).error.requestId).toBe('my-request-id');
  });

  it('无 requestId 时使用 "unknown"', () => {
    const req = {} as Request;
    const res = createMockRes();
    const error = GatewayError.internal('test');

    errorHandler(error, req, res as unknown as Response, next);

    expect((res._json as any).error.requestId).toBe('unknown');
  });

  it('GatewayError 保留原始消息', () => {
    const req = createMockReq();
    const res = createMockRes();
    const error = GatewayError.invalidRequest('model not found');

    errorHandler(error, req, res as unknown as Response, next);

    expect((res._json as any).error.message).toBe('model not found');
  });
});
