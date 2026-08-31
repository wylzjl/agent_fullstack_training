/** 统一错误码定义 */
export const ErrorCode = {
  INVALID_REQUEST: 'INVALID_REQUEST',
  AUTH_FAILED: 'AUTH_FAILED',
  RATE_LIMITED: 'RATE_LIMITED',
  MODEL_UNAVAILABLE: 'MODEL_UNAVAILABLE',
  TIMEOUT: 'TIMEOUT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  CLIENT_DISCONNECTED: 'CLIENT_DISCONNECTED',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** 错误码 → HTTP 状态码映射 */
export const ERROR_HTTP_STATUS: Record<ErrorCode, number> = {
  INVALID_REQUEST: 400,
  AUTH_FAILED: 401,
  RATE_LIMITED: 429,
  MODEL_UNAVAILABLE: 503,
  TIMEOUT: 504,
  INTERNAL_ERROR: 500,
  CLIENT_DISCONNECTED: 400,
};

/** 网关统一异常 */
export class GatewayError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly httpStatus: number,
    message: string,
  ) {
    super(message);
    this.name = 'GatewayError';
  }

  static invalidRequest(message: string): GatewayError {
    return new GatewayError(ErrorCode.INVALID_REQUEST, 400, message);
  }

  static rateLimited(retryAfterSeconds: number): GatewayError {
    return new GatewayError(
      ErrorCode.RATE_LIMITED,
      429,
      `请求过于频繁，请在 ${retryAfterSeconds} 秒后重试`,
    );
  }

  static modelUnavailable(message = '所有模型均不可用，请稍后重试'): GatewayError {
    return new GatewayError(ErrorCode.MODEL_UNAVAILABLE, 503, message);
  }

  static timeout(message = '请求超时'): GatewayError {
    return new GatewayError(ErrorCode.TIMEOUT, 504, message);
  }

  static internal(message = '网关内部错误'): GatewayError {
    return new GatewayError(ErrorCode.INTERNAL_ERROR, 500, message);
  }
}
