/** OpenAI Responses API 适配器（预留实现） */

import OpenAI from 'openai';
import type { LLMResponse, ModelConfig } from '../types/index.ts';
import type { ModelAdapter, InternalRequest, StreamResult, StreamChunk } from './ModelAdapter.ts';
import { GatewayError, ErrorCode } from '../errors/index.ts';

export class OpenAIResponsesAdapter implements ModelAdapter {
  supports(config: ModelConfig): boolean {
    // Responses API 目前仅 OpenAI 原生平台支持
    return !config.baseUrl.includes('anthropic') && config.baseUrl.includes('openai');
  }

  private createClient(config: ModelConfig): OpenAI {
    const apiKey = process.env[config.apiKeyEnv];
    if (!apiKey) {
      throw new GatewayError(ErrorCode.AUTH_FAILED, 401, `API Key 未配置: ${config.apiKeyEnv}`);
    }
    return new OpenAI({ apiKey, baseURL: config.baseUrl, maxRetries: 0 });
  }

  /** 将 messages 转换为 Responses API 的 input 格式 */
  private buildInput(request: InternalRequest): any[] {
    return request.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
  }

  async chat(request: InternalRequest, config: ModelConfig, requestId: string): Promise<LLMResponse> {
    const client = this.createClient(config);

    try {
      const response = await (client as any).responses.create({
        model: config.providerModel,
        input: this.buildInput(request),
        timeout: request.timeoutSeconds * 1000,
      });

      const content = response.output_text ?? '';

      return {
        requestId,
        model: config.providerModel,
        content,
        parsed: null,
        usage: {
          inputTokens: response.usage?.input_tokens ?? 0,
          outputTokens: response.usage?.output_tokens ?? 0,
        },
        ttftMs: 0,
        latencyMs: 0,
        attempts: 1,
      };
    } catch (err) {
      if (err instanceof GatewayError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      throw GatewayError.internal(`Responses API 请求失败: ${message}`);
    }
  }

  async chatStream(request: InternalRequest, config: ModelConfig, requestId: string): Promise<StreamResult> {
    const client = this.createClient(config);
    let inputTokens = 0;
    let outputTokens = 0;

    const stream = await (client as any).responses.create({
      model: config.providerModel,
      input: this.buildInput(request),
      stream: true,
      timeout: request.timeoutSeconds * 1000,
    });

    async function* iterate(): AsyncIterable<StreamChunk> {
      for await (const event of stream) {
        if (event.type === 'response.completed' && event.response?.usage) {
          inputTokens = event.response.usage.input_tokens ?? 0;
          outputTokens = event.response.usage.output_tokens ?? 0;
        } else if (event.type === 'response.output_text.delta') {
          yield { type: 'content', text: event.delta };
        }
      }
    }

    return {
      iterator: iterate(),
      getUsage: () => ({ inputTokens, outputTokens }),
    };
  }
}
