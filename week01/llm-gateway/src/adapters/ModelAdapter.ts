/** 适配器接口定义 + 工厂函数 */

import type { LLMResponse, ModelConfig, Message } from '../types/index.ts';
import { OpenAICompatibleAdapter } from './OpenAICompatibleAdapter.ts';
import { OpenAIResponsesAdapter } from './OpenAIResponsesAdapter.ts';
import { AnthropicMessageAdapter } from './AnthropicMessageAdapter.ts';

/** 网关内部统一请求对象，隔离供应商差异 */
export interface InternalRequest {
  messages: Message[];
  responseSchema: Record<string, unknown> | null;
  timeoutSeconds: number;
}

/** 适配器统一接口 */
export interface ModelAdapter {
  /** 发起非流式请求，返回统一 LLMResponse */
  chat(request: InternalRequest, config: ModelConfig, requestId: string): Promise<LLMResponse>;

  /** 发起流式请求，返回 StreamResult（迭代器 + Token 用量查询） */
  chatStream(request: InternalRequest, config: ModelConfig, requestId: string): Promise<StreamResult>;

  /** 判断该适配器是否支持指定模型配置 */
  supports(config: ModelConfig): boolean;
}

/** 流式调用结果，包含文本迭代器和 Token 用量查询 */
export interface StreamResult {
  /** 增量文本迭代器，区分 content 和 reasoning */
  iterator: AsyncIterable<StreamChunk>;
  /** 流结束后调用，获取 Token 消耗统计 */
  getUsage: () => { inputTokens: number; outputTokens: number };
}

/** 流式增量块，区分正文和思考过程 */
export interface StreamChunk {
  /** 块类型：content = 正文，reasoning = 思考过程 */
  type: 'content' | 'reasoning';
  /** 增量文本内容 */
  text: string;
}

/** 适配器类型标识 */
export type AdapterType = 'openai-chat' | 'openai-responses' | 'anthropic-messages';

/** 根据 ModelConfig 自动选择适配器 */
export function createAdapter(config: ModelConfig): ModelAdapter {
  const { baseUrl } = config;

  if (baseUrl.includes('anthropic')) {
    return new AnthropicMessageAdapter();
  }

  // 默认走 OpenAI 兼容协议
  return new OpenAICompatibleAdapter();
}

/** 根据适配器类型创建适配器 */
export function createAdapterByType(type: AdapterType): ModelAdapter {
  switch (type) {
    case 'openai-chat':
      return new OpenAICompatibleAdapter();
    case 'openai-responses':
      return new OpenAIResponsesAdapter();
    case 'anthropic-messages':
      return new AnthropicMessageAdapter();
  }
}
