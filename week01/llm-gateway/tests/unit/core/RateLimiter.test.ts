import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RateLimiter } from '../../../src/core/RateLimiter.ts';

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter();
  });

  it('令牌充足时允许通过', () => {
    const result = limiter.checkRateLimit('model-a', { ratePerSecond: 10, capacity: 5, enabled: true });
    expect(result.allowed).toBe(true);
  });

  it('令牌耗尽时拒绝并返回 retryAfterSeconds', () => {
    const config = { ratePerSecond: 1, capacity: 2, enabled: true };
    // 消耗完所有令牌
    limiter.checkRateLimit('model-a', config);
    limiter.checkRateLimit('model-a', config);
    // 第三次应被拒绝
    const result = limiter.checkRateLimit('model-a', config);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('令牌按 ratePerSecond 速率补充', () => {
    vi.useFakeTimers();
    const config = { ratePerSecond: 10, capacity: 10, enabled: true };

    // 消耗完所有令牌
    for (let i = 0; i < 10; i++) {
      limiter.checkRateLimit('model-a', config);
    }
    expect(limiter.checkRateLimit('model-a', config).allowed).toBe(false);

    // 推进 500ms，应补充 5 个令牌
    vi.advanceTimersByTime(500);
    const result = limiter.checkRateLimit('model-a', config);
    expect(result.allowed).toBe(true);

    vi.useRealTimers();
  });

  it('令牌不超过 capacity 上限', () => {
    vi.useFakeTimers();
    const config = { ratePerSecond: 100, capacity: 5, enabled: true };

    // 等待很长时间，令牌应不超过 capacity
    vi.advanceTimersByTime(10000);

    // 连续消耗 capacity 次，都应允许
    for (let i = 0; i < 5; i++) {
      expect(limiter.checkRateLimit('model-a', config).allowed).toBe(true);
    }
    // 第 6 次应拒绝
    expect(limiter.checkRateLimit('model-a', config).allowed).toBe(false);

    vi.useRealTimers();
  });

  it('不同 modelKey 独立桶', () => {
    const config = { ratePerSecond: 1, capacity: 1, enabled: true };

    // 消耗 model-a 的令牌
    limiter.checkRateLimit('model-a', config);
    expect(limiter.checkRateLimit('model-a', config).allowed).toBe(false);

    // model-b 不受影响
    expect(limiter.checkRateLimit('model-b', config).allowed).toBe(true);
  });

  it('enabled: false 时跳过限流', () => {
    const config = { ratePerSecond: 0, capacity: 0, enabled: false };
    const result = limiter.checkRateLimit('model-a', config);
    expect(result.allowed).toBe(true);
  });

  it('自定义 cost 参数', () => {
    const config = { ratePerSecond: 1, capacity: 5, enabled: true };
    // 消耗 3 个令牌
    limiter.checkRateLimit('model-a', config, 3);
    // 再消耗 3 个，应拒绝（只剩 2 个）
    const result = limiter.checkRateLimit('model-a', config, 3);
    expect(result.allowed).toBe(false);
  });
});
