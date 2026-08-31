import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../src/app.ts';
import { auditLogger } from '../../src/core/AuditLogger.ts';

// Mock OpenAI SDK
const mockCreate = vi.fn();
vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockCreate,
      },
    },
  })),
}));

describe('Error Handling (Integration)', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    auditLogger.clearTraces();
    process.env.PRIMARY_API_KEY = 'test-key';
    process.env.BACKUP_API_KEY = 'test-backup-key';
  });

  it('SDK 返回 401 → 401 AUTH_FAILED', async () => {
    // 所有调用都返回 401
    mockCreate.mockRejectedValue(new Error('401 Unauthorized'));

    const res = await request(app)
      .post('/v1/chat/completions')
      .send({
        model: 'general-primary',
        messages: [{ role: 'user', content: 'hello' }],
      });

    // 4xx 不触发 fallback，直接返回
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_FAILED');
    expect(res.body.error.requestId).toBeDefined();
  });

  it('SDK 持续失败 → 重试后 fallback → 最终 503', async () => {
    // 主模型和备用模型都失败
    mockCreate.mockRejectedValue(new Error('500 Internal Server Error'));

    const res = await request(app)
      .post('/v1/chat/completions')
      .send({
        model: 'general-primary',
        messages: [{ role: 'user', content: 'hello' }],
      });

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
  }, 30000);

  it('不存在的端点 → 404', async () => {
    const res = await request(app).get('/v1/nonexistent');

    expect(res.status).toBe(404);
  });

  it('错误响应格式统一', async () => {
    const res = await request(app)
      .post('/v1/chat/completions')
      .send({
        messages: [{ role: 'user', content: 'hello' }],
        // 缺少 model
      });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toHaveProperty('code');
    expect(res.body.error).toHaveProperty('message');
    expect(res.body.error).toHaveProperty('requestId');
  });

  it('空请求体返回 400', async () => {
    const res = await request(app)
      .post('/v1/chat/completions')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REQUEST');
  });

  it('messages 超过 100 条返回 400', async () => {
    const messages = Array.from({ length: 101 }, () => ({
      role: 'user',
      content: 'hello',
    }));

    const res = await request(app)
      .post('/v1/chat/completions')
      .send({
        model: 'general-primary',
        messages,
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REQUEST');
  });

  // ── 重试 + Fallback 场景 ──────────────────────────────────────────────────

  const backupSuccessResponse = {
    id: 'chatcmpl-backup',
    object: 'chat.completion',
    created: 1700000000,
    model: 'deepseek-chat',
    choices: [{
      index: 0,
      message: { role: 'assistant', content: 'Response from backup model' },
      finish_reason: 'stop',
    }],
    usage: { prompt_tokens: 10, completion_tokens: 15, total_tokens: 25 },
  };

  const primarySuccessResponse = {
    id: 'chatcmpl-primary',
    object: 'chat.completion',
    created: 1700000000,
    model: 'deepseek-v4-flash',
    choices: [{
      index: 0,
      message: { role: 'assistant', content: 'Response from primary model' },
      finish_reason: 'stop',
    }],
    usage: { prompt_tokens: 10, completion_tokens: 12, total_tokens: 22 },
  };

  const serverError = new Error('503 Internal Server Error');

  const sendRequest = () =>
    request(app)
      .post('/v1/chat/completions')
      .send({
        model: 'general-primary',
        messages: [{ role: 'user', content: 'hello' }],
      });

  it('主模型连续失败达到上限 → 降级到备用模型 → 备用模型成功', async () => {
    // 主模型失败 3 次，备用模型第 1 次成功
    mockCreate
      .mockRejectedValueOnce(serverError)   // 主模型 attempt 1
      .mockRejectedValueOnce(serverError)   // 主模型 attempt 2
      .mockRejectedValueOnce(serverError)   // 主模型 attempt 3（重试耗尽）
      .mockResolvedValueOnce(backupSuccessResponse); // 备用模型 attempt 1 → 成功

    const res = await sendRequest();

    expect(res.status).toBe(200);
    expect(res.body.content).toBe('Response from backup model');
    expect(res.body.model).toBe('general-backup');
    expect(res.body.usage.inputTokens).toBe(10);
    expect(res.body.usage.outputTokens).toBe(15);
    // 主模型 3 次 + 备用模型 1 次 = 4 次调用
    expect(mockCreate).toHaveBeenCalledTimes(4);
  }, 30000);

  it('主模型失败 2 次后第 3 次成功', async () => {
    mockCreate
      .mockRejectedValueOnce(serverError)   // attempt 1 失败
      .mockRejectedValueOnce(serverError)   // attempt 2 失败
      .mockResolvedValueOnce(primarySuccessResponse); // attempt 3 成功

    const res = await sendRequest();

    expect(res.status).toBe(200);
    expect(res.body.content).toBe('Response from primary model');
    expect(res.body.model).toBe('general-primary');
    expect(res.body.usage.inputTokens).toBe(10);
    expect(res.body.usage.outputTokens).toBe(12);
    // 共 3 次调用，未触发 fallback
    expect(mockCreate).toHaveBeenCalledTimes(3);
  }, 30000);

  it('主模型 + 备用模型均连续失败达到上限 → 返回 503', async () => {
    // 主模型 3 次 + 备用模型 3 次 = 6 次全部失败
    mockCreate.mockRejectedValue(serverError);

    const res = await sendRequest();

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    // 主模型 3 次 + 备用模型 3 次 = 6 次调用
    expect(mockCreate).toHaveBeenCalledTimes(6);
  }, 30000);

  // ── 限流场景 ──────────────────────────────────────────────────────────────

  it('模型调用超过限流上限 → 返回 429 RATE_LIMITED', async () => {
    mockCreate.mockResolvedValue(primarySuccessResponse);

    // 桶容量为 5，快速连续发送请求直到触发限流
    const results = [];
    for (let i = 0; i < 20; i++) {
      results.push(sendRequest());
    }
    const responses = await Promise.all(results);

    // 应至少有一个请求被限流
    const rateLimited = responses.filter((r) => r.status === 429);
    expect(rateLimited.length).toBeGreaterThan(0);

    // 验证限流响应格式
    const limited = rateLimited[0];
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    expect(limited.body.error.requestId).toBeDefined();
    expect(limited.body.error.message).toContain('秒');
  }, 30000);
});
