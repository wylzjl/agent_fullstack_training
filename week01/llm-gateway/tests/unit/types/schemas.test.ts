import { describe, it, expect } from 'vitest';
import {
  MessageSchema,
  LLMRequestSchema,
  ModelConfigSchema,
  CallTraceSchema,
  UsageSchema,
  PromptSelectionSchema,
  PromptTemplateSchema,
} from '../../../src/types/schemas.ts';

describe('MessageSchema', () => {
  it('合法消息通过校验', () => {
    const result = MessageSchema.safeParse({ role: 'user', content: 'hello' });
    expect(result.success).toBe(true);
  });

  it('非法 role 被拒绝', () => {
    const result = MessageSchema.safeParse({ role: 'tool', content: 'hello' });
    expect(result.success).toBe(false);
  });

  it('空 content 被拒绝', () => {
    const result = MessageSchema.safeParse({ role: 'user', content: '' });
    expect(result.success).toBe(false);
  });

  it('超长 content 被拒绝', () => {
    const result = MessageSchema.safeParse({ role: 'user', content: 'x'.repeat(20001) });
    expect(result.success).toBe(false);
  });

  it('额外字段被拒绝（strict 模式）', () => {
    const result = MessageSchema.safeParse({ role: 'user', content: 'hello', extra: true });
    expect(result.success).toBe(false);
  });
});

describe('LLMRequestSchema', () => {
  const baseRequest = {
    model: 'general-primary',
    messages: [{ role: 'user', content: 'hello' }],
  };

  it('合法请求通过校验', () => {
    const result = LLMRequestSchema.safeParse(baseRequest);
    expect(result.success).toBe(true);
  });

  it('默认值填充', () => {
    const result = LLMRequestSchema.parse(baseRequest);
    expect(result.stream).toBe(false);
    expect(result.timeoutSeconds).toBe(30);
    expect(result.responseSchema).toBe(null);
    expect(result.prompt).toBe(null);
  });

  it('缺少 model 字段返回错误', () => {
    const result = LLMRequestSchema.safeParse({ messages: [{ role: 'user', content: 'hi' }] });
    expect(result.success).toBe(false);
  });

  it('messages 为空数组返回错误', () => {
    const result = LLMRequestSchema.safeParse({ model: 'test', messages: [] });
    expect(result.success).toBe(false);
  });

  it('stream + responseSchema 互斥', () => {
    const result = LLMRequestSchema.safeParse({
      ...baseRequest,
      stream: true,
      responseSchema: { type: 'object', properties: {} },
    });
    expect(result.success).toBe(false);
  });

  it('stream=true 但 responseSchema=null 允许', () => {
    const result = LLMRequestSchema.safeParse({
      ...baseRequest,
      stream: true,
      responseSchema: null,
    });
    expect(result.success).toBe(true);
  });

  it('timeoutSeconds 超范围返回错误', () => {
    expect(LLMRequestSchema.safeParse({ ...baseRequest, timeoutSeconds: 0 }).success).toBe(false);
    expect(LLMRequestSchema.safeParse({ ...baseRequest, timeoutSeconds: 121 }).success).toBe(false);
    expect(LLMRequestSchema.safeParse({ ...baseRequest, timeoutSeconds: -1 }).success).toBe(false);
  });

  it('timeoutSeconds 边界值允许', () => {
    expect(LLMRequestSchema.safeParse({ ...baseRequest, timeoutSeconds: 1 }).success).toBe(true);
    expect(LLMRequestSchema.safeParse({ ...baseRequest, timeoutSeconds: 120 }).success).toBe(true);
  });
});

describe('UsageSchema', () => {
  it('合法 usage 通过', () => {
    const result = UsageSchema.safeParse({ inputTokens: 10, outputTokens: 20 });
    expect(result.success).toBe(true);
  });

  it('负数被拒绝', () => {
    expect(UsageSchema.safeParse({ inputTokens: -1, outputTokens: 0 }).success).toBe(false);
    expect(UsageSchema.safeParse({ inputTokens: 0, outputTokens: -1 }).success).toBe(false);
  });

  it('浮点数被拒绝', () => {
    expect(UsageSchema.safeParse({ inputTokens: 1.5, outputTokens: 0 }).success).toBe(false);
  });
});

describe('PromptSelectionSchema', () => {
  it('合法选择通过', () => {
    const result = PromptSelectionSchema.safeParse({
      name: 'test',
      version: 'v1',
      variables: { key: 'value' },
    });
    expect(result.success).toBe(true);
  });

  it('空 name 被拒绝', () => {
    const result = PromptSelectionSchema.safeParse({
      name: '',
      version: 'v1',
      variables: {},
    });
    expect(result.success).toBe(false);
  });
});

describe('PromptTemplateSchema', () => {
  it('合法模板通过', () => {
    const result = PromptTemplateSchema.safeParse({
      name: 'test',
      version: 'v1',
      systemTemplate: 'Hello ${name}',
    });
    expect(result.success).toBe(true);
  });
});

describe('ModelConfigSchema', () => {
  const baseConfig = {
    providerModel: 'gpt-4',
    baseUrl: 'https://api.openai.com',
    apiKeyEnv: 'OPENAI_API_KEY',
    supportsStructuredOutput: true,
    structuredOutputMode: 'json_object' as const,
  };

  it('合法配置通过', () => {
    const result = ModelConfigSchema.safeParse(baseConfig);
    expect(result.success).toBe(true);
  });

  it('缺少必填字段失败', () => {
    expect(ModelConfigSchema.safeParse({ ...baseConfig, providerModel: undefined }).success).toBe(false);
    expect(ModelConfigSchema.safeParse({ ...baseConfig, baseUrl: undefined }).success).toBe(false);
    expect(ModelConfigSchema.safeParse({ ...baseConfig, apiKeyEnv: undefined }).success).toBe(false);
  });

  it('structuredOutputMode 非法值失败', () => {
    const result = ModelConfigSchema.safeParse({ ...baseConfig, structuredOutputMode: 'invalid' });
    expect(result.success).toBe(false);
  });

  it('rateLimit 可选', () => {
    const result = ModelConfigSchema.safeParse(baseConfig);
    expect(result.success).toBe(true);
  });

  it('rateLimit 合法配置通过', () => {
    const result = ModelConfigSchema.safeParse({
      ...baseConfig,
      rateLimit: { ratePerSecond: 1, capacity: 5, scope: 'model', tokenCost: 'request', enabled: true },
    });
    expect(result.success).toBe(true);
  });
});

describe('CallTraceSchema', () => {
  const baseTrace = {
    requestId: 'test-id',
    timestamp: new Date().toISOString(),
    requestedModel: 'general-primary',
    actualModel: 'general-primary',
    promptName: null,
    promptVersion: null,
    inputTokens: 10,
    outputTokens: 20,
    costUsd: 0,
    ttftMs: 0,
    latencyMs: 500,
    attempts: 1,
    status: 'success' as const,
    errorCode: null,
  };

  it('合法 trace 通过', () => {
    const result = CallTraceSchema.safeParse(baseTrace);
    expect(result.success).toBe(true);
  });

  it('status 仅允许 success 和 failed', () => {
    expect(CallTraceSchema.safeParse({ ...baseTrace, status: 'success' }).success).toBe(true);
    expect(CallTraceSchema.safeParse({ ...baseTrace, status: 'failed' }).success).toBe(true);
    expect(CallTraceSchema.safeParse({ ...baseTrace, status: 'pending' }).success).toBe(false);
  });

  it('负数 token 被拒绝', () => {
    expect(CallTraceSchema.safeParse({ ...baseTrace, inputTokens: -1 }).success).toBe(false);
  });
});
