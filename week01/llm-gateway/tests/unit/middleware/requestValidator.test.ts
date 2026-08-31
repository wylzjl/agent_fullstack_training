import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequestValidator } from '../../../src/middleware/requestValidator.ts';
import type { Request, Response, NextFunction } from 'express';

function createMockReq(body: unknown, requestId = 'test-req-id'): Request {
  return {
    body,
    requestId,
  } as unknown as Request;
}

function createMockRes(): Response {
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
  return res as Response;
}

describe('createRequestValidator', () => {
  let next: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    next = vi.fn();
  });

  describe('非流式端点 (isStream=false)', () => {
    const validator = createRequestValidator(false);

    it('合法请求体通过校验', () => {
      const req = createMockReq({
        model: 'general-primary',
        messages: [{ role: 'user', content: 'hello' }],
      });
      const res = createMockRes();

      validator(req, res as Response, next);

      expect(next).toHaveBeenCalled();
      expect(req.validatedRequest).toBeDefined();
      expect(req.validatedRequest.model).toBe('general-primary');
    });

    it('缺少 model 字段返回 400', () => {
      const req = createMockReq({
        messages: [{ role: 'user', content: 'hello' }],
      });
      const res = createMockRes();

      validator(req, res as Response, next);

      expect(next).not.toHaveBeenCalled();
      expect(res._status).toBe(400);
      expect(res._json.error.code).toBe('INVALID_REQUEST');
    });

    it('messages 为空数组返回 400', () => {
      const req = createMockReq({
        model: 'general-primary',
        messages: [],
      });
      const res = createMockRes();

      validator(req, res as Response, next);

      expect(next).not.toHaveBeenCalled();
      expect(res._status).toBe(400);
    });

    it('stream + responseSchema 互斥返回 400', () => {
      const req = createMockReq({
        model: 'general-primary',
        messages: [{ role: 'user', content: 'hello' }],
        stream: true,
        responseSchema: { type: 'object' },
      });
      const res = createMockRes();

      validator(req, res as Response, next);

      expect(next).not.toHaveBeenCalled();
      expect(res._status).toBe(400);
    });

    it('timeoutSeconds 超范围返回 400', () => {
      const req = createMockReq({
        model: 'general-primary',
        messages: [{ role: 'user', content: 'hello' }],
        timeoutSeconds: 200,
      });
      const res = createMockRes();

      validator(req, res as Response, next);

      expect(next).not.toHaveBeenCalled();
      expect(res._status).toBe(400);
    });

    it('默认值填充', () => {
      const req = createMockReq({
        model: 'general-primary',
        messages: [{ role: 'user', content: 'hello' }],
      });
      const res = createMockRes();

      validator(req, res as Response, next);

      expect(next).toHaveBeenCalled();
      expect(req.validatedRequest.stream).toBe(false);
      expect(req.validatedRequest.timeoutSeconds).toBe(30);
      expect(req.validatedRequest.responseSchema).toBe(null);
    });
  });

  describe('流式端点 (isStream=true)', () => {
    const validator = createRequestValidator(true);

    it('合法流式请求通过', () => {
      const req = createMockReq({
        model: 'general-primary',
        messages: [{ role: 'user', content: 'hello' }],
      });
      const res = createMockRes();

      validator(req, res as Response, next);

      expect(next).toHaveBeenCalled();
    });

    it('流式端点传 responseSchema 返回 400', () => {
      const req = createMockReq({
        model: 'general-primary',
        messages: [{ role: 'user', content: 'hello' }],
        responseSchema: { type: 'object' },
      });
      const res = createMockRes();

      validator(req, res as Response, next);

      expect(next).not.toHaveBeenCalled();
      expect(res._status).toBe(400);
      expect(res._json.error.message).toContain('responseSchema');
    });

    it('responseSchema 为 null 时通过', () => {
      const req = createMockReq({
        model: 'general-primary',
        messages: [{ role: 'user', content: 'hello' }],
        responseSchema: null,
      });
      const res = createMockRes();

      validator(req, res as Response, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('错误响应格式', () => {
    const validator = createRequestValidator(false);

    it('错误响应包含 requestId', () => {
      const req = createMockReq({}, 'my-unique-id');
      req.body = { invalid: true };
      const res = createMockRes();

      validator(req, res as Response, next);

      expect(res._json.error.requestId).toBe('my-unique-id');
    });
  });
});
