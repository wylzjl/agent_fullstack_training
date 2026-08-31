/** 指数退避重试处理器 */

import { GatewayError } from '../errors/index.ts';

export interface RetryOptions {
  /** 最大重试次数，默认 3 */
  maxRetries?: number;
  /** 基础延迟（毫秒），默认 500 */
  baseDelay?: number;
}

/** 判断错误是否可重试：网络错误、5xx、超时 */
function isRetryable(err: unknown): boolean {
  if (err instanceof GatewayError) {
    // 4xx 客户端错误不可重试
    if (err.httpStatus >= 400 && err.httpStatus < 500) {
      return false;
    }
    // 5xx 或服务端错误可重试
    return true;
  }
  // 网络错误、超时等视为可重试
  return true;
}

/** 等待指定毫秒 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 计算退避延迟：baseDelay * 2^(attempt-1) + random(0, baseDelay) */
function calculateDelay(attempt: number, baseDelay: number): number {
  const exponential = baseDelay * Math.pow(2, attempt - 1);
  const jitter = Math.random() * baseDelay;
  return exponential + jitter;
}

/** 带重试的异步执行 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<{ result: T; attempts: number }> {
  const maxRetries = options.maxRetries ?? 3;
  const baseDelay = options.baseDelay ?? 500;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      return { result, attempts: attempt };
    } catch (err) {
      lastError = err;
      if (!isRetryable(err) || attempt >= maxRetries) {
        throw err;
      }
      const delay = calculateDelay(attempt, baseDelay);
      await sleep(delay);
    }
  }

  // 理论上不会到这里，但保险起见
  throw lastError;
}
