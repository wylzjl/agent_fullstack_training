import { describe, it, expect, vi } from 'vitest';
import { requestIdMiddleware } from '../../../src/middleware/requestId.ts';
import type { Request, Response, NextFunction } from 'express';

function createMockReq(headers: Record<string, string> = {}): Request {
  return { headers } as unknown as Request;
}

function createMockRes(): Response {
  return {} as Response;
}

describe('requestIdMiddleware', () => {
  it('请求头有 X-Request-Id 时复用', () => {
    const req = createMockReq({ 'x-request-id': 'custom-id-123' });
    const res = createMockRes();
    const next = vi.fn();

    requestIdMiddleware(req, res, next);

    expect(req.requestId).toBe('custom-id-123');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('请求头无 X-Request-Id 时生成 UUID', () => {
    const req = createMockReq({});
    const res = createMockRes();
    const next = vi.fn();

    requestIdMiddleware(req, res, next);

    expect(req.requestId).toBeDefined();
    expect(typeof req.requestId).toBe('string');
    expect(req.requestId.length).toBeGreaterThan(0);
    // UUID v4 格式校验
    expect(req.requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('X-Request-Id 为空字符串时生成 UUID', () => {
    const req = createMockReq({ 'x-request-id': '' });
    const res = createMockRes();
    const next = vi.fn();

    requestIdMiddleware(req, res, next);

    // 空字符串应触发自动生成
    expect(req.requestId).not.toBe('');
    expect(req.requestId.length).toBeGreaterThan(0);
  });

  it('调用 next() 继续链', () => {
    const req = createMockReq({});
    const res = createMockRes();
    const next = vi.fn();

    requestIdMiddleware(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });
});
