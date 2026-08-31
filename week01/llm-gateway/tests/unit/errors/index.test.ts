import { describe, it, expect } from 'vitest';
import { GatewayError, ErrorCode, ERROR_HTTP_STATUS } from '../../../src/errors/index.ts';

describe('ErrorCode', () => {
  it('所有错误码已定义', () => {
    expect(ErrorCode.INVALID_REQUEST).toBe('INVALID_REQUEST');
    expect(ErrorCode.AUTH_FAILED).toBe('AUTH_FAILED');
    expect(ErrorCode.RATE_LIMITED).toBe('RATE_LIMITED');
    expect(ErrorCode.MODEL_UNAVAILABLE).toBe('MODEL_UNAVAILABLE');
    expect(ErrorCode.TIMEOUT).toBe('TIMEOUT');
    expect(ErrorCode.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
    expect(ErrorCode.CLIENT_DISCONNECTED).toBe('CLIENT_DISCONNECTED');
  });
});

describe('ERROR_HTTP_STATUS', () => {
  it('所有错误码都有对应 HTTP 状态映射', () => {
    expect(ERROR_HTTP_STATUS.INVALID_REQUEST).toBe(400);
    expect(ERROR_HTTP_STATUS.AUTH_FAILED).toBe(401);
    expect(ERROR_HTTP_STATUS.RATE_LIMITED).toBe(429);
    expect(ERROR_HTTP_STATUS.MODEL_UNAVAILABLE).toBe(503);
    expect(ERROR_HTTP_STATUS.TIMEOUT).toBe(504);
    expect(ERROR_HTTP_STATUS.INTERNAL_ERROR).toBe(500);
    expect(ERROR_HTTP_STATUS.CLIENT_DISCONNECTED).toBe(400);
  });

  it('映射覆盖所有 ErrorCode', () => {
    const allCodes = Object.keys(ErrorCode);
    const mappedCodes = Object.keys(ERROR_HTTP_STATUS);
    expect(mappedCodes.sort()).toEqual(allCodes.sort());
  });
});

describe('GatewayError', () => {
  it('invalidRequest() 返回 400', () => {
    const err = GatewayError.invalidRequest('bad input');
    expect(err).toBeInstanceOf(GatewayError);
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('INVALID_REQUEST');
    expect(err.httpStatus).toBe(400);
    expect(err.message).toBe('bad input');
    expect(err.name).toBe('GatewayError');
  });

  it('rateLimited() 返回 429', () => {
    const err = GatewayError.rateLimited(5);
    expect(err.code).toBe('RATE_LIMITED');
    expect(err.httpStatus).toBe(429);
    expect(err.message).toContain('5');
  });

  it('modelUnavailable() 返回 503', () => {
    const err = GatewayError.modelUnavailable();
    expect(err.code).toBe('MODEL_UNAVAILABLE');
    expect(err.httpStatus).toBe(503);
  });

  it('modelUnavailable() 支持自定义消息', () => {
    const err = GatewayError.modelUnavailable('custom msg');
    expect(err.message).toBe('custom msg');
  });

  it('timeout() 返回 504', () => {
    const err = GatewayError.timeout();
    expect(err.code).toBe('TIMEOUT');
    expect(err.httpStatus).toBe(504);
  });

  it('internal() 返回 500', () => {
    const err = GatewayError.internal();
    expect(err.code).toBe('INTERNAL_ERROR');
    expect(err.httpStatus).toBe(500);
  });

  it('构造函数正确设置所有属性', () => {
    const err = new GatewayError('AUTH_FAILED', 401, 'key expired');
    expect(err.code).toBe('AUTH_FAILED');
    expect(err.httpStatus).toBe(401);
    expect(err.message).toBe('key expired');
    expect(err.name).toBe('GatewayError');
    expect(err instanceof Error).toBe(true);
  });
});
