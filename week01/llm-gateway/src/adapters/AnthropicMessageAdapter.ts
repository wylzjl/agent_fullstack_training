/** Anthropic Messages API 适配器 */

import Anthropic from '@anthropic-ai/sdk';
import type { LLMResponse, ModelConfig, Message } from '../types/index.ts';
import type { ModelAdapter, InternalRequest, StreamResult, StreamChunk } from './ModelAdapter.ts';
import { GatewayError, ErrorCode } from '../errors/index.ts';

export class AnthropicMessageAdapter implements ModelAdapter {
  supports(config: ModelConfig): boolean {
    return config.baseUrl.includes('anthropic');
  }

  private createClient(config: ModelConfig): Anthropic {
    const apiKey = process.env[config.apiKeyEnv];
    if (!apiKey) {
      throw new GatewayError(ErrorCode.AUTH_FAILED, 401, `API Key 未配置: ${config.apiKeyEnv}`);
    }
    return new Anthropic({ apiKey, baseURL: config.baseUrl });
  }

  /** 从 messages 中提取 system 消息，返回 { system, messages } */
  private extractSystem(messages: Message[]): { system: string | undefined; messages: Message[] } {
    const systemMsg = messages.find((m) => m.role === 'system');
    const system = systemMsg?.content;
    const filtered = messages.filter((m) => m.role !== 'system');
    return { system, messages: filtered };
  }

  async chat(request: InternalRequest, config: ModelConfig, requestId: string): Promise<LLMResponse> {
    const client = this.createClient(config);
    const { system, messages } = this.extractSystem(request.messages);

    try {
      const params: Anthropic.MessageCreateParamsNonStreaming = {
        model: config.providerModel,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        max_tokens: 4096,
        timeout: request.timeoutSeconds * 1000,
      };

      if (system) {
        params.system = system;
      }

      const response = await client.messages.create(params);

      if (response.type !== 'message') {
        throw GatewayError.internal(`Anthropic 返回非预期响应类型: ${response.type}`);
      }

      const content = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('');

      return {
        requestId,
        model: config.providerModel,
        content,
        parsed: null,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
        ttftMs: 0,
        latencyMs: 0,
        attempts: 1,
      };
    } catch (err) {
      if (err instanceof GatewayError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('401') || message.includes('authentication')) {
        throw new GatewayError(ErrorCode.AUTH_FAILED, 401, 'Anthropic API Key 无效或过期');
      }
      throw GatewayError.internal(`Anthropic 请求失败: ${message}`);
    }
  }

  async chatStream(request: InternalRequest, config: ModelConfig, requestId: string): Promise<StreamResult> {
    const client = this.createClient(config);
    const { system, messages } = this.extractSystem(request.messages);
    let inputTokens = 0;
    let outputTokens = 0;

    const params: Anthropic.MessageCreateParamsStreaming = {
      model: config.providerModel,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: 4096,
      stream: true,
      timeout: request.timeoutSeconds * 1000,
    };

    if (system) {
      params.system = system;
    }

    const stream = await client.messages.create(params);

    async function* iterate(): AsyncIterable<StreamChunk> {
      for await (const event of stream) {
        if (event.type === 'message_start' && event.message?.usage) {
          inputTokens = event.message.usage.input_tokens;
        } else if (event.type === 'message_delta' && event.usage) {
          outputTokens = event.usage.output_tokens;
        } else if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            yield { type: 'content', text: event.delta.text };
          } else if (event.delta.type === 'thinking_delta') {
            yield { type: 'reasoning', text: (event.delta as any).thinking ?? '' };
          }
        }
      }
    }

    return {
      iterator: iterate(),
      getUsage: () => ({ inputTokens, outputTokens }),
    };
  }
}
