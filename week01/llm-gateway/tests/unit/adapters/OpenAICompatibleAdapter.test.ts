import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAICompatibleAdapter } from '../../../src/adapters/OpenAICompatibleAdapter.ts';
import { GatewayError } from '../../../src/errors/index.ts';
import { mockPrimaryConfig, mockInternalRequest, mockOpenAIChatResponse } from '../../helpers/fixtures.ts';
import type { ModelConfig } from '../../../src/types/index.ts';

// Mock OpenAI SDK
const mockCreate = vi.fn();
vi.mock('openai', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    })),
  };
});

describe('OpenAICompatibleAdapter', () => {
  let adapter: OpenAICompatibleAdapter;
  const originalEnv = process.env;

  beforeEach(() => {
    adapter = new OpenAICompatibleAdapter();
    process.env = { ...originalEnv, PRIMARY_API_KEY: 'test-key-123' };
    mockCreate.mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('chat()', () => {
    it('正常非流式调用', async () => {
      mockCreate.mockResolvedValue(mockOpenAIChatResponse);

      const result = await adapter.chat(mockInternalRequest, mockPrimaryConfig, 'req-1');

      expect(result.requestId).toBe('req-1');
      expect(result.content).toBe('Hello from OpenAI!');
      expect(result.usage.inputTokens).toBe(10);
      expect(result.usage.outputTokens).toBe(20);
      expect(result.model).toBe('deepseek-v4-flash');
      expect(result.parsed).toBe(null);
    });

    it('API Key 未配置时抛出 AUTH_FAILED', async () => {
      delete process.env.PRIMARY_API_KEY;

      await expect(
        adapter.chat(mockInternalRequest, mockPrimaryConfig, 'req-1'),
      ).rejects.toThrow(GatewayError);

      try {
        await adapter.chat(mockInternalRequest, mockPrimaryConfig, 'req-1');
      } catch (err) {
        expect((err as GatewayError).code).toBe('AUTH_FAILED');
        expect((err as GatewayError).httpStatus).toBe(401);
      }
    });

    it('供应商返回空响应时抛出 INTERNAL', async () => {
      mockCreate.mockResolvedValue({ choices: [] });

      await expect(
        adapter.chat(mockInternalRequest, mockPrimaryConfig, 'req-1'),
      ).rejects.toThrow('供应商返回空响应');
    });

    it('401 错误转换为 AUTH_FAILED', async () => {
      mockCreate.mockRejectedValue(new Error('401 Unauthorized'));

      await expect(
        adapter.chat(mockInternalRequest, mockPrimaryConfig, 'req-1'),
      ).rejects.toThrow(GatewayError);

      try {
        await adapter.chat(mockInternalRequest, mockPrimaryConfig, 'req-1');
      } catch (err) {
        expect((err as GatewayError).code).toBe('AUTH_FAILED');
      }
    });

    it('其他供应商错误转换为 INTERNAL_ERROR', async () => {
      mockCreate.mockRejectedValue(new Error('connection timeout'));

      await expect(
        adapter.chat(mockInternalRequest, mockPrimaryConfig, 'req-1'),
      ).rejects.toThrow(GatewayError);

      try {
        await adapter.chat(mockInternalRequest, mockPrimaryConfig, 'req-1');
      } catch (err) {
        expect((err as GatewayError).code).toBe('INTERNAL_ERROR');
      }
    });

    it('结构化输出 json_object 模式', async () => {
      mockCreate.mockResolvedValue({
        ...mockOpenAIChatResponse,
        choices: [{
          ...mockOpenAIChatResponse.choices[0],
          message: { ...mockOpenAIChatResponse.choices[0].message, content: '{"name":"test"}' },
        }],
      });

      const request = {
        ...mockInternalRequest,
        responseSchema: { type: 'object', properties: { name: { type: 'string' } } },
      };

      const result = await adapter.chat(request, mockPrimaryConfig, 'req-1');

      // 验证传入了 response_format: { type: 'json_object' }
      const callArgs = mockCreate.mock.calls[0];
      expect(callArgs[0].response_format).toEqual({ type: 'json_object' });

      // parsed 应被解析
      expect(result.parsed).toEqual({ name: 'test' });
    });

    it('结构化输出 json_schema 模式', async () => {
      mockCreate.mockResolvedValue(mockOpenAIChatResponse);

      const config = { ...mockPrimaryConfig, structuredOutputMode: 'json_schema' as const };
      const request = {
        ...mockInternalRequest,
        responseSchema: { type: 'object', properties: { name: { type: 'string' } } },
      };

      await adapter.chat(request, config, 'req-1');

      const callArgs = mockCreate.mock.calls[0];
      expect(callArgs[0].response_format.type).toBe('json_schema');
      expect(callArgs[0].response_format.json_schema).toBeDefined();
    });

    it('结构化输出解析失败时 parsed 保持 null', async () => {
      mockCreate.mockResolvedValue({
        ...mockOpenAIChatResponse,
        choices: [{
          ...mockOpenAIChatResponse.choices[0],
          message: { ...mockOpenAIChatResponse.choices[0].message, content: 'not json' },
        }],
      });

      const request = {
        ...mockInternalRequest,
        responseSchema: { type: 'object' },
      };

      const result = await adapter.chat(request, mockPrimaryConfig, 'req-1');
      expect(result.parsed).toBe(null);
    });

    it('传递正确的 timeout 参数', async () => {
      mockCreate.mockResolvedValue(mockOpenAIChatResponse);

      const request = { ...mockInternalRequest, timeoutSeconds: 60 };
      await adapter.chat(request, mockPrimaryConfig, 'req-1');

      const callArgs = mockCreate.mock.calls[0];
      expect(callArgs[1].timeout).toBe(60000);
    });
  });

  describe('chatStream()', () => {
    it('流式调用返回 chunk 迭代器', async () => {
      const chunks = [
        { choices: [{ delta: { content: 'Hello' }, index: 0 }], usage: null },
        { choices: [{ delta: { content: ' world' }, index: 0 }], usage: null },
        { choices: [{ delta: {}, index: 0 }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } },
      ];

      // 模拟异步迭代器
      mockCreate.mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          for (const chunk of chunks) {
            yield chunk;
          }
        },
      });

      const result = await adapter.chatStream(mockInternalRequest, mockPrimaryConfig, 'req-1');

      const collected: string[] = [];
      for await (const chunk of result.iterator) {
        if (chunk.type === 'content') {
          collected.push(chunk.text);
        }
      }

      expect(collected).toEqual(['Hello', ' world']);
      expect(result.getUsage()).toEqual({ inputTokens: 10, outputTokens: 5 });
    });

    it('流式区分 content 和 reasoning', async () => {
      const chunks = [
        { choices: [{ delta: { reasoning_content: 'thinking...' }, index: 0 }], usage: null },
        { choices: [{ delta: { content: 'answer' }, index: 0 }], usage: null },
        { choices: [{ delta: {}, index: 0 }], usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 } },
      ];

      mockCreate.mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          for (const chunk of chunks) {
            yield chunk;
          }
        },
      });

      const result = await adapter.chatStream(mockInternalRequest, mockPrimaryConfig, 'req-1');

      const types: string[] = [];
      for await (const chunk of result.iterator) {
        types.push(chunk.type);
      }

      expect(types).toEqual(['reasoning', 'content']);
    });
  });

  describe('supports()', () => {
    it('非 anthropic URL 返回 true', () => {
      expect(adapter.supports(mockPrimaryConfig)).toBe(true);
    });

    it('anthropic URL 返回 false', () => {
      expect(adapter.supports({ ...mockPrimaryConfig, baseUrl: 'https://api.anthropic.com' })).toBe(false);
    });
  });
});
