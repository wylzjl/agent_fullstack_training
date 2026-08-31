import { describe, it, expect } from 'vitest';
import { createAdapter, createAdapterByType } from '../../../src/adapters/ModelAdapter.ts';
import { OpenAICompatibleAdapter } from '../../../src/adapters/OpenAICompatibleAdapter.ts';
import { OpenAIResponsesAdapter } from '../../../src/adapters/OpenAIResponsesAdapter.ts';
import { AnthropicMessageAdapter } from '../../../src/adapters/AnthropicMessageAdapter.ts';
import type { ModelConfig } from '../../../src/types/index.ts';

const baseConfig: ModelConfig = {
  providerModel: 'test-model',
  baseUrl: 'https://api.deepseek.com',
  apiKeyEnv: 'TEST_API_KEY',
  supportsStructuredOutput: true,
  structuredOutputMode: 'json_object',
};

describe('createAdapter', () => {
  it('baseUrl 含 anthropic 返回 AnthropicMessageAdapter', () => {
    const config = { ...baseConfig, baseUrl: 'https://api.anthropic.com' };
    const adapter = createAdapter(config);
    expect(adapter).toBeInstanceOf(AnthropicMessageAdapter);
  });

  it('其他 baseUrl 返回 OpenAICompatibleAdapter', () => {
    const adapter = createAdapter(baseConfig);
    expect(adapter).toBeInstanceOf(OpenAICompatibleAdapter);
  });

  it('OpenAI URL 也返回 OpenAICompatibleAdapter', () => {
    const config = { ...baseConfig, baseUrl: 'https://api.openai.com' };
    const adapter = createAdapter(config);
    expect(adapter).toBeInstanceOf(OpenAICompatibleAdapter);
  });
});

describe('createAdapterByType', () => {
  it('openai-chat 返回 OpenAICompatibleAdapter', () => {
    const adapter = createAdapterByType('openai-chat');
    expect(adapter).toBeInstanceOf(OpenAICompatibleAdapter);
  });

  it('openai-responses 返回 OpenAIResponsesAdapter', () => {
    const adapter = createAdapterByType('openai-responses');
    expect(adapter).toBeInstanceOf(OpenAIResponsesAdapter);
  });

  it('anthropic-messages 返回 AnthropicMessageAdapter', () => {
    const adapter = createAdapterByType('anthropic-messages');
    expect(adapter).toBeInstanceOf(AnthropicMessageAdapter);
  });
});

describe('ModelAdapter.supports', () => {
  it('OpenAICompatibleAdapter 支持非 anthropic URL', () => {
    const adapter = new OpenAICompatibleAdapter();
    expect(adapter.supports(baseConfig)).toBe(true);
    expect(adapter.supports({ ...baseConfig, baseUrl: 'https://api.openai.com' })).toBe(true);
  });

  it('OpenAICompatibleAdapter 不支持 anthropic URL', () => {
    const adapter = new OpenAICompatibleAdapter();
    expect(adapter.supports({ ...baseConfig, baseUrl: 'https://api.anthropic.com' })).toBe(false);
  });

  it('AnthropicMessageAdapter 支持 anthropic URL', () => {
    const adapter = new AnthropicMessageAdapter();
    expect(adapter.supports({ ...baseConfig, baseUrl: 'https://api.anthropic.com' })).toBe(true);
  });

  it('AnthropicMessageAdapter 不支持非 anthropic URL', () => {
    const adapter = new AnthropicMessageAdapter();
    expect(adapter.supports(baseConfig)).toBe(false);
  });

  it('OpenAIResponsesAdapter 仅支持 openai URL', () => {
    const adapter = new OpenAIResponsesAdapter();
    expect(adapter.supports({ ...baseConfig, baseUrl: 'https://api.openai.com' })).toBe(true);
    expect(adapter.supports({ ...baseConfig, baseUrl: 'https://api.deepseek.com' })).toBe(false);
    expect(adapter.supports({ ...baseConfig, baseUrl: 'https://api.anthropic.com' })).toBe(false);
  });
});
