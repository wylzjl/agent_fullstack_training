/** 共享测试数据 */

import type { LLMRequest, ModelConfig, CallTrace, Message } from '../../src/types/index.ts';
import type { InternalRequest, StreamChunk } from '../../src/adapters/ModelAdapter.ts';

// ── 合法请求体 ──────────────────────────────────────────────────────────────

export const validRequest: LLMRequest = {
  model: 'general-primary',
  messages: [{ role: 'user', content: 'hello' }],
  stream: false,
  responseSchema: null,
  timeoutSeconds: 30,
  prompt: null,
};

export const validRequestWithPrompt: LLMRequest = {
  ...validRequest,
  prompt: {
    name: 'knowledge_decision',
    version: 'v1',
    variables: { product_name: 'XX保险' },
  },
};

// ── ModelConfig ─────────────────────────────────────────────────────────────

export const mockPrimaryConfig: ModelConfig = {
  providerModel: 'deepseek-v4-flash',
  baseUrl: 'https://api.deepseek.com',
  apiKeyEnv: 'PRIMARY_API_KEY',
  supportsStructuredOutput: true,
  structuredOutputMode: 'json_object',
  rateLimit: {
    ratePerSecond: 10,
    capacity: 100,
    scope: 'model',
    tokenCost: 'request',
    enabled: true,
  },
};

export const mockBackupConfig: ModelConfig = {
  providerModel: 'deepseek-chat',
  baseUrl: 'https://api.deepseek.com',
  apiKeyEnv: 'BACKUP_API_KEY',
  supportsStructuredOutput: true,
  structuredOutputMode: 'json_object',
  rateLimit: {
    ratePerSecond: 10,
    capacity: 100,
    scope: 'model',
    tokenCost: 'request',
    enabled: true,
  },
};

export const mockAnthropicConfig: ModelConfig = {
  providerModel: 'claude-3-sonnet',
  baseUrl: 'https://api.anthropic.com',
  apiKeyEnv: 'ANTHROPIC_API_KEY',
  supportsStructuredOutput: false,
  structuredOutputMode: 'json_object',
};

// ── InternalRequest ─────────────────────────────────────────────────────────

export const mockInternalRequest: InternalRequest = {
  messages: [{ role: 'user', content: 'hello' }],
  responseSchema: null,
  timeoutSeconds: 30,
};

// ── OpenAI SDK 预设响应 ─────────────────────────────────────────────────────

export const mockOpenAIChatResponse = {
  id: 'chatcmpl-test',
  object: 'chat.completion',
  created: 1700000000,
  model: 'deepseek-v4-flash',
  choices: [
    {
      index: 0,
      message: {
        role: 'assistant',
        content: 'Hello from OpenAI!',
      },
      finish_reason: 'stop',
    },
  ],
  usage: {
    prompt_tokens: 10,
    completion_tokens: 20,
    total_tokens: 30,
  },
};

export const mockOpenAIEmptyResponse = {
  ...mockOpenAIChatResponse,
  choices: [],
};

export const mockOpenAIStreamChunks = [
  {
    choices: [{ delta: { content: 'Hello' }, index: 0 }],
    usage: null,
  },
  {
    choices: [{ delta: { content: ' world' }, index: 0 }],
    usage: null,
  },
  {
    choices: [{ delta: {}, index: 0 }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  },
];

export const mockOpenAIStreamChunksWithReasoning = [
  {
    choices: [{ delta: { reasoning_content: 'Let me think...' }, index: 0 }],
    usage: null,
  },
  {
    choices: [{ delta: { content: 'The answer is 42.' }, index: 0 }],
    usage: null,
  },
  {
    choices: [{ delta: {}, index: 0 }],
    usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 },
  },
];

// ── Anthropic SDK 预设响应 ──────────────────────────────────────────────────

export const mockAnthropicChatResponse = {
  id: 'msg_test',
  type: 'message',
  role: 'assistant',
  content: [{ type: 'text', text: 'Hello from Anthropic!' }],
  model: 'claude-3-sonnet',
  stop_reason: 'end_turn',
  usage: {
    input_tokens: 15,
    output_tokens: 25,
  },
};

export const mockAnthropicStreamEvents = [
  {
    type: 'message_start',
    message: {
      usage: { input_tokens: 15 },
    },
  },
  {
    type: 'content_block_delta',
    delta: { type: 'text_delta', text: 'Hello' },
  },
  {
    type: 'content_block_delta',
    delta: { type: 'text_delta', text: ' from Anthropic!' },
  },
  {
    type: 'message_delta',
    usage: { output_tokens: 10 },
  },
];

// ── CallTrace 测试数据 ──────────────────────────────────────────────────────

export const mockCallTrace: CallTrace = {
  requestId: 'test-request-id',
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
  status: 'success',
  errorCode: null,
};

// ── Messages ────────────────────────────────────────────────────────────────

export const messagesWithSystem: Message[] = [
  { role: 'system', content: 'You are a helpful assistant.' },
  { role: 'user', content: 'hello' },
];
