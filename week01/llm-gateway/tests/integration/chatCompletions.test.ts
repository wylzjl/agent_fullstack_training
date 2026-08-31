import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../src/app.ts';
import { auditLogger } from '../../src/core/AuditLogger.ts';

// Mock OpenAI SDK — 让适配器返回预设响应
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

const mockChatResponse = {
  id: 'chatcmpl-int-test',
  object: 'chat.completion',
  created: 1700000000,
  model: 'deepseek-v4-flash',
  choices: [
    {
      index: 0,
      message: { role: 'assistant', content: 'Integration test response!' },
      finish_reason: 'stop',
    },
  ],
  usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
};

describe('/v1/chat/completions', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    auditLogger.clearTraces();
    process.env.PRIMARY_API_KEY = 'test-key';
    process.env.BACKUP_API_KEY = 'test-backup-key';
  });

  describe('POST /v1/chat/completions', () => {
    it('正常调用返回 200', async () => {
      mockCreate.mockResolvedValue(mockChatResponse);

      const res = await request(app)
        .post('/v1/chat/completions')
        .send({
          model: 'general-primary',
          messages: [{ role: 'user', content: 'hello' }],
        });

      expect(res.status).toBe(200);
      expect(res.body.requestId).toBeDefined();
      expect(res.body.content).toBe('Integration test response!');
      expect(res.body.usage).toBeDefined();
      expect(res.body.usage.inputTokens).toBe(10);
      expect(res.body.usage.outputTokens).toBe(20);
      expect(res.body.model).toBe('general-primary');
    });

    it('使用 prompt 模板', async () => {
      mockCreate.mockResolvedValue(mockChatResponse);

      const res = await request(app)
        .post('/v1/chat/completions')
        .send({
          model: 'general-primary',
          messages: [{ role: 'user', content: '查询退保规则' }],
          prompt: {
            name: 'knowledge_decision',
            version: 'v1',
            variables: { product_name: 'XX保险' },
          },
        });

      expect(res.status).toBe(200);

      // 验证传给 SDK 的 messages 包含 system 消息
      const callArgs = mockCreate.mock.calls[0][0];
      const systemMsg = callArgs.messages.find((m: any) => m.role === 'system');
      expect(systemMsg).toBeDefined();
      expect(systemMsg.content).toContain('XX保险');
    });

    it('缺少必填字段返回 400', async () => {
      const res = await request(app)
        .post('/v1/chat/completions')
        .send({
          messages: [{ role: 'user', content: 'hello' }],
          // 缺少 model
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_REQUEST');
    });

    it('未知模型返回 400', async () => {
      const res = await request(app)
        .post('/v1/chat/completions')
        .send({
          model: 'nonexistent-model',
          messages: [{ role: 'user', content: 'hello' }],
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_REQUEST');
    });

    it('响应包含正确的 Content-Type', async () => {
      mockCreate.mockResolvedValue(mockChatResponse);

      const res = await request(app)
        .post('/v1/chat/completions')
        .send({
          model: 'general-primary',
          messages: [{ role: 'user', content: 'hello' }],
        });

      expect(res.headers['content-type']).toContain('application/json');
    });

    it('X-Request-Id 请求头被复用', async () => {
      mockCreate.mockResolvedValue(mockChatResponse);

      const res = await request(app)
        .post('/v1/chat/completions')
        .set('X-Request-Id', 'my-custom-id')
        .send({
          model: 'general-primary',
          messages: [{ role: 'user', content: 'hello' }],
        });

      expect(res.status).toBe(200);
      expect(res.body.requestId).toBe('my-custom-id');
    });
  });

  describe('POST /v1/chat/completions/stream', () => {
    it('流式调用返回 SSE 响应', async () => {
      const chunks = [
        { choices: [{ delta: { content: 'Hello' }, index: 0 }], usage: null },
        { choices: [{ delta: { content: ' world' }, index: 0 }], usage: null },
        { choices: [{ delta: {}, index: 0 }], usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 } },
      ];

      mockCreate.mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          for (const chunk of chunks) {
            yield chunk;
          }
        },
      });

      const res = await request(app)
        .post('/v1/chat/completions/stream')
        .send({
          model: 'general-primary',
          messages: [{ role: 'user', content: 'hello' }],
        });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/event-stream');

      // 解析 SSE 数据
      const text = res.text;
      const dataLines = text.split('\n').filter((line: string) => line.startsWith('data: '));
      expect(dataLines.length).toBeGreaterThan(0);

      // 验证最后一个事件是 done=true
      const lastEvent = JSON.parse(dataLines[dataLines.length - 1].replace('data: ', ''));
      expect(lastEvent.done).toBe(true);
      expect(lastEvent.usage).toBeDefined();
    });

    it('流式端点传 responseSchema 返回 400', async () => {
      const res = await request(app)
        .post('/v1/chat/completions/stream')
        .send({
          model: 'general-primary',
          messages: [{ role: 'user', content: 'hello' }],
          responseSchema: { type: 'object' },
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_REQUEST');
    });
  });
});
