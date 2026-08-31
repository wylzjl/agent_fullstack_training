/** 内存令牌桶限流器，每个模型 key 独立一个桶 */

interface RateLimitConfig {
  ratePerSecond: number;
  capacity: number;
  enabled?: boolean;
}

interface ConsumeResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

/** 单个令牌桶 */
class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(private readonly capacity: number, private readonly ratePerSecond: number) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  /** 根据时间差补充令牌 */
  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.ratePerSecond);
    this.lastRefill = now;
  }

  /** 尝试消耗令牌 */
  consume(cost: number): ConsumeResult {
    this.refill();
    if (this.tokens >= cost) {
      this.tokens -= cost;
      return { allowed: true };
    }
    const deficit = cost - this.tokens;
    const retryAfterSeconds = Math.ceil(deficit / this.ratePerSecond);
    return { allowed: false, retryAfterSeconds };
  }
}

/** 限流器，管理所有模型 key 的令牌桶 */
export class RateLimiter {
  private readonly buckets = new Map<string, TokenBucket>();

  /** 检查并消耗令牌 */
  checkRateLimit(modelKey: string, config: RateLimitConfig, cost = 1): ConsumeResult {
    if (config.enabled === false) {
      return { allowed: true };
    }

    let bucket = this.buckets.get(modelKey);
    if (!bucket) {
      bucket = new TokenBucket(config.capacity, config.ratePerSecond);
      this.buckets.set(modelKey, bucket);
    }

    return bucket.consume(cost);
  }
}
