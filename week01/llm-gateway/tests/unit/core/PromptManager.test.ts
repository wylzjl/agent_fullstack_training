import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolvePrompt } from '../../../src/core/PromptManager.ts';
import { GatewayError } from '../../../src/errors/index.ts';

// Mock PROMPT_TEMPLATES
vi.mock('../../../src/prompt/index.ts', () => ({
  PROMPT_TEMPLATES: {
    'knowledge_decision_v1': {
      name: 'knowledge_decision',
      version: 'v1',
      systemTemplate: '你是${product_name}的知识库决策器。资料不足时搜索，资料充分时结束回答。',
    },
    'multi_var_v1': {
      name: 'multi_var',
      version: 'v1',
      systemTemplate: '${greeting}，欢迎来到${company}，我是${assistant_name}。',
    },
  },
}));

describe('PromptManager', () => {
  it('正确查找并替换模板变量', () => {
    const result = resolvePrompt({
      name: 'knowledge_decision',
      version: 'v1',
      variables: { product_name: 'XX保险' },
    });

    expect(result).toHaveLength(1);
    expect(result[0].role).toBe('system');
    expect(result[0].content).toContain('XX保险');
    expect(result[0].content).not.toContain('${product_name}');
  });

  it('未提供值的占位符保持原样', () => {
    const result = resolvePrompt({
      name: 'knowledge_decision',
      version: 'v1',
      variables: {}, // 不提供 product_name
    });

    expect(result[0].content).toContain('${product_name}');
  });

  it('模板不存在时抛出 400 错误', () => {
    expect(() =>
      resolvePrompt({
        name: 'nonexistent',
        version: 'v1',
        variables: {},
      }),
    ).toThrow(GatewayError);

    try {
      resolvePrompt({ name: 'nonexistent', version: 'v1', variables: {} });
    } catch (err) {
      expect(err).toBeInstanceOf(GatewayError);
      expect((err as GatewayError).code).toBe('INVALID_REQUEST');
      expect((err as GatewayError).httpStatus).toBe(400);
    }
  });

  it('返回 system 消息数组', () => {
    const result = resolvePrompt({
      name: 'knowledge_decision',
      version: 'v1',
      variables: { product_name: 'Test' },
    });

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveProperty('role', 'system');
    expect(result[0]).toHaveProperty('content');
  });

  it('多个变量同时替换', () => {
    const result = resolvePrompt({
      name: 'multi_var',
      version: 'v1',
      variables: {
        greeting: '你好',
        company: 'ACME',
        assistant_name: '小助手',
      },
    });

    expect(result[0].content).toBe('你好，欢迎来到ACME，我是小助手。');
  });

  it('部分变量替换', () => {
    const result = resolvePrompt({
      name: 'multi_var',
      version: 'v1',
      variables: { greeting: '你好' },
      // company 和 assistant_name 未提供
    });

    expect(result[0].content).toContain('你好');
    expect(result[0].content).toContain('${company}');
    expect(result[0].content).toContain('${assistant_name}');
  });
});
