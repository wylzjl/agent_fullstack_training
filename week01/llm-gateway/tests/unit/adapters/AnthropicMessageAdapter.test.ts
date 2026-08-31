import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AnthropicMessageAdapter } from '../../../src/adapters/AnthropicMessageAdapter.ts';
import { GatewayError } from '../../../src/errors/index.ts';
import { mockAnthropicConfig, mockInternalRequest, mockAnthropicChatResponse, messagesWithSystem } from '../../helpers/fixtures.ts';
import type { ModelConfig } from '../../../src/types/index.ts';

// Mock Anthropic SDK
const mockCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        create: mockCreate,
      },
    })),
  };
});

describe('AnthropicMessageAdapter', () => {
  let adapter: AnthropicMessageAdapter;
  const originalEnv = process.env;

  beforeEach(() => {
    adapter = new AnthropicMessageAdapter();
    process.env = { ...originalEnv, ANTHROPIC_API_KEY: 'test-anthropic-key' };
    mockCreate.mockReset();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('chat()', () => {
    it('正常非流式调用', async () => {
      mockCreate.mockResolvedValue(mockAnthropicChatResponse);

      const result = await adapter.chat(mockInternalRequest, mockAnthropicConfig, 'req-1');

      expect(result.requestId).toBe('req-1');
      expect(result.content).toBe('Hello from Anthropic!');
      expect(result.usage.inputTokens).toBe(15);
      expect(result.usage.outputTokens).toBe(25);
      expect(result.model).toBe('claude-3-sonnet');
    });

    it('system 消息提取为独立字段', async () => {
      mockCreate.mockResolvedValue(mockAnthropicChatResponse);

      const request = { ...mockInternalRequest, messages: messagesWithSystem };
      await adapter.chat(request, mockAnthropicConfig, 'req-1');

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.system).toBe('You are a helpful assistant.');
      // messages 中不应包含 system 角色
      expect(callArgs.messages.every((m: any) => m.role !== 'system')).toBe(true);
    });

    it('max_tokens 固定为 4096', async () => {
      mockCreate.mockResolvedValue(mockAnthropicChatResponse);

      await adapter.chat(mockInternalRequest, mockAnthropicConfig, 'req-1');

      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.max_tokens).toBe(4096);
    });

    it('API Key 未配置时抛出 AUTH_FAILED', async () => {
      delete process.env.ANTHROPIC_API_KEY;

      await expect(
        adapter.chat(mockInternalRequest, mockAnthropicConfig, 'req-1'),
      ).rejects.toThrow(GatewayError);
    });

    it('401 错误转换为 AUTH_FAILED', async () => {
      mockCreate.mockRejectedValue(new Error('401 authentication failed'));

      await expect(
        adapter.chat(mockInternalRequest, mockAnthropicConfig, 'req-1'),
      ).rejects.toThrow(GatewayError);

      try {
        await adapter.chat(mockInternalRequest, mockAnthropicConfig, 'req-1');
      } catch (err) {
        expect((err as GatewayError).code).toBe('AUTH_FAILED');
      }
    });

    it('非预期响应类型抛出 INTERNAL', async () => {
      mockCreate.mockResolvedValue({ type: 'error', error: { message: 'bad' } });

      await expect(
        adapter.chat(mockInternalRequest, mockAnthropicConfig, 'req-1'),
      ).rejects.toThrow('非预期响应类型');
    });

    it('其他供应商错误转换为 INTERNAL_ERROR', async () => {
      mockCreate.mockRejectedValue(new Error('connection refused'));

      await expect(
        adapter.chat(mockInternalRequest, mockAnthropicConfig, 'req-1'),
      ).rejects.toThrow(GatewayError);

      try {
        await adapter.chat(mockInternalRequest, mockAnthropicConfig, 'req-1');
      } catch (err) {
        expect((err as GatewayError).code).toBe('INTERNAL_ERROR');
      }
    });
  });

  describe('chatStream()', () => {
    it('流式调用处理多种事件', async () => {
      const events = [
        { type: 'message_start', message: { usage: { input_tokens: 20 } } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: ' world' } },
        { type: 'message_delta', usage: { output_tokens: 10 } },
      ];

      mockCreate.mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          for (const event of events) {
            yield event;
          }
        },
      });

      const result = await adapter.chatStream(mockInternalRequest, mockAnthropicConfig, 'req-1');

      const texts: string[] = [];
      for await (const chunk of result.iterator) {
        texts.push(chunk.text);
      }

      expect(texts).toEqual(['Hello', ' world']);
      expect(result.getUsage()).toEqual({ inputTokens: 20, outputTokens: 10 });
    });

    it('流式 thinking_delta 产出 reasoning 类型', async () => {
      const events = [
        { type: 'message_start', message: { usage: { input_tokens: 10 } } },
        { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'let me think' } },
        { type: 'content_block_delta', delta: { type: 'text_delta', text: 'answer' } },
        { type: 'message_delta', usage: { output_tokens: 5 } },
      ];

      mockCreate.mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          for (const event of events) {
            yield event;
          }
        },
      });

      const result = await adapter.chatStream(mockInternalRequest, mockAnthropicConfig, 'req-1');

      const chunks: Array<{ type: string; text: string }> = [];
      for await (const chunk of result.iterator) {
        chunks.push({ type: chunk.type, text: chunk.text });
      }

      expect(chunks[0]).toEqual({ type: 'reasoning', text: 'let me think' });
      expect(chunks[1]).toEqual({ type: 'content', text: 'answer' });
    });
  });

  describe('supports()', () => {
    it('anthropic URL 返回 true', () => {
      expect(adapter.supports(mockAnthropicConfig)).toBe(true);
    });

    it('非 anthropic URL 返回 false', () => {
      expect(adapter.supports({ ...mockAnthropicConfig, baseUrl: 'https://api.deepseek.com' })).toBe(false);
    });
  });
});
