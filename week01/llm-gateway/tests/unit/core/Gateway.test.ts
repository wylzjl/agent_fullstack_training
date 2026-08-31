import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Gateway } from '../../../src/core/Gateway.ts';
import { GatewayError } from '../../../src/errors/index.ts';
import { validRequest, validRequestWithPrompt, mockPrimaryConfig } from '../../helpers/fixtures.ts';
import type { LLMResponse } from '../../../src/types/index.ts';
import type { ModelAdapter, StreamResult, StreamChunk } from '../../../src/adapters/ModelAdapter.ts';

// Mock 依赖模块
const mockChat = vi.fn();
const mockChatStream = vi.fn();
const mockAdapter: ModelAdapter = {
  chat: mockChat,
  chatStream: mockChatStream,
  supports: () => true,
};

vi.mock('../../../src/adapters/ModelAdapter.ts', () => ({
  createAdapter: () => mockAdapter,
  createAdapterByType: () => mockAdapter,
}));

// Mock PROMPT_TEMPLATES
vi.mock('../../../src/prompt/index.ts', () => ({
  PROMPT_TEMPLATES: {
    'knowledge_decision_v1': {
      name: 'knowledge_decision',
      version: 'v1',
      systemTemplate: '你是${product_name}的知识库决策器。',
    },
  },
}));

// Mock AuditLogger 避免控制台输出
vi.mock('../../../src/core/AuditLogger.ts', () => {
  const mockLogger = {
    log: vi.fn(),
    getTraces: vi.fn().mockReturnValue([]),
    clearTraces: vi.fn(),
    addSink: vi.fn(),
  };
  return {
    AuditLogger: vi.fn(() => mockLogger),
    auditLogger: mockLogger,
  };
});

const mockLLMResponse: LLMResponse = {
  requestId: 'req-1',
  model: 'deepseek-v4-flash',
  content: 'Hello!',
  parsed: null,
  usage: { inputTokens: 10, outputTokens: 20 },
  ttftMs: 0,
  latencyMs: 0,
  attempts: 1,
};

describe('Gateway', () => {
  let gateway: Gateway;

  beforeEach(() => {
    gateway = new Gateway();
    mockChat.mockReset();
    mockChatStream.mockReset();
    // 设置环境变量以通过 API Key 检查
    process.env.PRIMARY_API_KEY = 'test-key';
    process.env.BACKUP_API_KEY = 'test-backup-key';
  });

  describe('execute()', () => {
    it('正常执行返回 LLMResponse', async () => {
      mockChat.mockResolvedValue(mockLLMResponse);

      const result = await gateway.execute(validRequest, 'req-1');

      expect(result.content).toBe('Hello!');
      expect(result.usage.inputTokens).toBe(10);
      expect(result.usage.outputTokens).toBe(20);
      expect(result.model).toBe('general-primary');
      expect(result.attempts).toBe(1);
    });

    it('PromptManager 集成：请求包含 prompt 时注入 system 消息', async () => {
      mockChat.mockResolvedValue(mockLLMResponse);

      await gateway.execute(validRequestWithPrompt, 'req-1');

      // 验证传给适配器的 messages 头部有 system 消息
      const callArgs = mockChat.mock.calls[0][0];
      expect(callArgs.messages[0].role).toBe('system');
      expect(callArgs.messages[0].content).toContain('XX保险');
    });

    it('未知模型抛出 INVALID_REQUEST', async () => {
      const request = { ...validRequest, model: 'unknown-model' };

      await expect(gateway.execute(request, 'req-1')).rejects.toThrow(GatewayError);

      try {
        await gateway.execute(request, 'req-1');
      } catch (err) {
        expect((err as GatewayError).code).toBe('INVALID_REQUEST');
        expect((err as GatewayError).httpStatus).toBe(400);
      }
    });

    it('主模型失败后 fallback 到备用', async () => {
      mockChat
        .mockRejectedValueOnce(new GatewayError('INTERNAL_ERROR', 500, 'server error'))
        .mockRejectedValueOnce(new GatewayError('INTERNAL_ERROR', 500, 'server error'))
        .mockRejectedValueOnce(new GatewayError('INTERNAL_ERROR', 500, 'server error'))
        .mockResolvedValueOnce({ ...mockLLMResponse, model: 'general-backup' });

      const result = await gateway.execute(validRequest, 'req-1');

      expect(result.model).toBe('general-backup');
      expect(mockChat).toHaveBeenCalledTimes(4); // 3 retries on primary + 1 call to backup
    });

    it('4xx 错误不触发 fallback', async () => {
      mockChat.mockRejectedValue(new GatewayError('INVALID_REQUEST', 400, 'bad request'));

      await expect(gateway.execute(validRequest, 'req-1')).rejects.toThrow(GatewayError);

      // 只调用了一次（不重试也不 fallback）
      expect(mockChat).toHaveBeenCalledTimes(1);
    });

    // it('审计日志记录', async () => {
    //   mockChat.mockResolvedValue(mockLLMResponse);
    //   const { auditLogger } = await import('../../../src/core/AuditLogger.ts');

    //   await gateway.execute(validRequest, 'req-1');

    //   expect(auditLogger.log).toHaveBeenCalled();
    //   const trace = auditLogger.log.mock.calls[0][0];
    //   expect(trace.requestId).toBe('req-1');
    //   expect(trace.requestedModel).toBe('general-primary');
    //   expect(trace.status).toBe('success');
    // });

    it('返回结果包含 latencyMs', async () => {
      mockChat.mockResolvedValue(mockLLMResponse);

      const result = await gateway.execute(validRequest, 'req-1');

      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('executeStream()', () => {
    it('流式执行返回迭代器', async () => {
      const chunks: StreamChunk[] = [
        { type: 'content', text: 'Hello' },
        { type: 'content', text: ' world' },
      ];

      const mockStreamResult: StreamResult = {
        iterator: (async function* () {
          for (const chunk of chunks) {
            yield chunk;
          }
        })(),
        getUsage: () => ({ inputTokens: 5, outputTokens: 10 }),
      };

      mockChatStream.mockResolvedValue(mockStreamResult);

      const result = await gateway.executeStream(validRequest, 'req-1');

      expect(result.model).toBe('general-primary');
      expect(result.iterator).toBeDefined();
      expect(result.getUsage).toBeDefined();
      expect(result.onEnd).toBeDefined();
      expect(result.onError).toBeDefined();

      // 消费迭代器
      const collected: string[] = [];
      for await (const chunk of result.iterator) {
        collected.push(chunk.text);
      }
      expect(collected).toEqual(['Hello', ' world']);
    });

    it('未知模型抛出 INVALID_REQUEST', async () => {
      const request = { ...validRequest, model: 'unknown-model' };

      await expect(gateway.executeStream(request, 'req-1')).rejects.toThrow(GatewayError);
    });

    it('主模型流式失败后 fallback 到备用', async () => {
      const chunks: StreamChunk[] = [{ type: 'content', text: 'backup response' }];
      const mockStreamResult: StreamResult = {
        iterator: (async function* () {
          for (const chunk of chunks) {
            yield chunk;
          }
        })(),
        getUsage: () => ({ inputTokens: 5, outputTokens: 5 }),
      };

      mockChatStream
        .mockRejectedValueOnce(new GatewayError('INTERNAL_ERROR', 500, 'server error'))
        .mockResolvedValueOnce(mockStreamResult);

      const result = await gateway.executeStream(validRequest, 'req-1');

      expect(result.model).toBe('general-backup');
    });

    // it('onEnd 记录成功审计', async () => {
    //   const chunks: StreamChunk[] = [{ type: 'content', text: 'ok' }];
    //   const mockStreamResult: StreamResult = {
    //     iterator: (async function* () {
    //       for (const chunk of chunks) {
    //         yield chunk;
    //       }
    //     })(),
    //     getUsage: () => ({ inputTokens: 5, outputTokens: 5 }),
    //   };

    //   mockChatStream.mockResolvedValue(mockStreamResult);
    //   const { auditLogger } = await import('../../../src/core/AuditLogger.ts');

    //   const result = await gateway.executeStream(validRequest, 'req-1');

    //   // 消费迭代器
    //   for await (const _ of result.iterator) { /* consume */ }

    //   result.onEnd();

    //   expect(auditLogger.log).toHaveBeenCalled();
    //   const trace = auditLogger.log.mock.calls[0][0];
    //   expect(trace.status).toBe('success');
    // });
  });
});
