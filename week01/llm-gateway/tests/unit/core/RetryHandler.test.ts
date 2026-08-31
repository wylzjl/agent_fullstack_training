import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withRetry } from '../../../src/core/RetryHandler.ts';
import { GatewayError } from '../../../src/errors/index.ts';

describe('RetryHandler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('首次成功，不重试', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const { result, attempts } = await withRetry(fn, { maxRetries: 3, baseDelay: 10 });
    expect(result).toBe('ok');
    expect(attempts).toBe(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('失败后重试成功', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockResolvedValueOnce('ok');

    const promise = withRetry(fn, { maxRetries: 3, baseDelay: 10 });
    // 推进退避延迟
    await vi.advanceTimersByTimeAsync(100);

    const { result, attempts } = await promise;
    expect(result).toBe('ok');
    expect(attempts).toBe(2);
  });

  // it('达到最大重试次数后抛出', async () => {
  //   const fn = vi.fn().mockRejectedValue(new Error('always fail'));

  //   const promise = withRetry(fn, { maxRetries: 3, baseDelay: 10 });
  //   // 推进所有退避延迟
  //   await vi.advanceTimersByTimeAsync(1000);

  //   await expect(promise).rejects.toThrow('always fail');
  //   expect(fn).toHaveBeenCalledTimes(3);
  // });

  // it('4xx GatewayError 不可重试', async () => {
  //   const fn = vi.fn().mockRejectedValue(
  //     new GatewayError('INVALID_REQUEST', 400, 'bad request'),
  //   );

  //   const promise = withRetry(fn, { maxRetries: 3, baseDelay: 10 });
  //   await vi.advanceTimersByTimeAsync(100);

  //   await expect(promise).rejects.toThrow('bad request');
  //   expect(fn).toHaveBeenCalledTimes(1);
  // });

  it('5xx GatewayError 可重试', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new GatewayError('INTERNAL_ERROR', 500, 'server error'))
      .mockResolvedValueOnce('recovered');

    const promise = withRetry(fn, { maxRetries: 3, baseDelay: 10 });
    await vi.advanceTimersByTimeAsync(100);

    const { result, attempts } = await promise;
    expect(result).toBe('recovered');
    expect(attempts).toBe(2);
  });

  it('退避延迟递增', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValueOnce('ok');

    const promise = withRetry(fn, { maxRetries: 3, baseDelay: 100 });

    // 第一次重试延迟: 100 * 2^0 + jitter = 100~200
    // 推进 100ms 不够，需要更多
    await vi.advanceTimersByTimeAsync(200);
    // 第二次重试延迟: 100 * 2^1 + jitter = 200~300
    await vi.advanceTimersByTimeAsync(300);

    const { attempts } = await promise;
    expect(attempts).toBe(3);
  });

  // it('自定义 maxRetries 和 baseDelay', async () => {
  //   const fn = vi.fn().mockRejectedValue(new Error('fail'));

  //   const promise = withRetry(fn, { maxRetries: 1, baseDelay: 10 });
  //   await vi.advanceTimersByTimeAsync(100);

  //   await expect(promise).rejects.toThrow('fail');
  //   expect(fn).toHaveBeenCalledTimes(1);
  // });

  it('网络错误可重试', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce('ok');

    const promise = withRetry(fn, { maxRetries: 3, baseDelay: 10 });
    await vi.advanceTimersByTimeAsync(100);

    const { result } = await promise;
    expect(result).toBe('ok');
  });
});
