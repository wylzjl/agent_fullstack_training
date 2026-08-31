/** OpenAI Chat Completion API 适配器 */

import OpenAI from 'openai';
import type { LLMResponse, ModelConfig } from '../types/index.ts';
import type { ModelAdapter, InternalRequest, StreamResult, StreamChunk } from './ModelAdapter.ts';
import { GatewayError, ErrorCode } from '../errors/index.ts';

export class OpenAICompatibleAdapter implements ModelAdapter {
  supports(config: ModelConfig): boolean {
    return !config.baseUrl.includes('anthropic');
  }

  private createClient(config: ModelConfig): OpenAI {
    const apiKey = process.env[config.apiKeyEnv];
    if (!apiKey) {
      throw new GatewayError(ErrorCode.AUTH_FAILED, 401, `API Key 未配置: ${config.apiKeyEnv}`);
    }
    return new OpenAI({ apiKey, baseURL: config.baseUrl, maxRetries: 0 });
  }

  /** 构建请求参数，处理结构化输出 */
  private buildParams(
    request: InternalRequest,
    config: ModelConfig,
  ): OpenAI.ChatCompletionCreateParamsNonStreaming {
    const params: OpenAI.ChatCompletionCreateParamsNonStreaming = {
      model: config.providerModel,
      messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
    };

    // 结构化输出处理
    if (request.responseSchema && config.supportsStructuredOutput) {
      if (config.structuredOutputMode === 'json_schema') {
        params.response_format = {
          type: 'json_schema',
          json_schema: {
            name: 'structured_output',
            schema: request.responseSchema,
            strict: true,
          },
        };
      } else if (config.structuredOutputMode === 'json_object') {
        params.response_format = { type: 'json_object' };
        // 在 system prompt 中注入 Schema 约束
        const schemaHint = `\n\n你必须返回符合以下 JSON Schema 的 JSON 对象：\n${JSON.stringify(request.responseSchema)}`;
        const systemMsg = params.messages.find((m) => m.role === 'system');
        if (systemMsg) {
          systemMsg.content += schemaHint;
        } else {
          params.messages.unshift({ role: 'system', content: `你是一个结构化数据输出助手。${schemaHint}` });
        }
      }
    }

    return params;
  }

  async chat(request: InternalRequest, config: ModelConfig, requestId: string): Promise<LLMResponse> {
    const client = this.createClient(config);
    const params = this.buildParams(request, config);

    try {
      const response = await client.chat.completions.create(params, {
        timeout: request.timeoutSeconds * 1000,
      });
      const choice = response.choices?.[0];
      if (!choice) {
        throw GatewayError.internal('供应商返回空响应');
      }

      const content = choice.message?.content ?? '';
      let parsed: Record<string, unknown> | unknown[] | null = null;

      // 尝试解析结构化输出
      if (request.responseSchema && content) {
        try {
          parsed = JSON.parse(content);
        } catch {
          // 解析失败不报错，parsed 保持 null
        }
      }

      return {
        requestId,
        model: config.providerModel,
        content,
        parsed,
        usage: {
          inputTokens: response.usage?.prompt_tokens ?? 0,
          outputTokens: response.usage?.completion_tokens ?? 0,
        },
        ttftMs: 0,
        latencyMs: 0, // 由 Gateway 计算
        attempts: 1,
      };
    } catch (err) {
      if (err instanceof GatewayError) throw err;
      // 将供应商错误转换为 GatewayError
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('401') || message.includes('Unauthorized')) {
        throw new GatewayError(ErrorCode.AUTH_FAILED, 401, 'API Key 无效或过期');
      }
      throw GatewayError.internal(`供应商请求失败: ${message}`);
    }
  }

  async chatStream(request: InternalRequest, config: ModelConfig, requestId: string): Promise<StreamResult> {
    const client = this.createClient(config);
    let inputTokens = 0;
    let outputTokens = 0;

    const params: OpenAI.ChatCompletionCreateParamsStreaming = {
      model: config.providerModel,
      messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
      stream: true,
      stream_options: { include_usage: true },
    };

    const stream = await client.chat.completions.create(params, {
      timeout: request.timeoutSeconds * 1000,
    });

    async function* iterate(): AsyncIterable<StreamChunk> {
      for await (const chunk of stream) {
        // 最后一个 chunk 携带 usage 信息
        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens ?? 0;
          outputTokens = chunk.usage.completion_tokens ?? 0;
        }
        const delta = chunk.choices?.[0]?.delta as any;
        if (!delta) continue;
        // 思考过程（DeepSeek 等推理模型）
        if (delta.reasoning_content) {
          yield { type: 'reasoning', text: delta.reasoning_content };
        }
        // 正文内容
        if (delta.content) {
          yield { type: 'content', text: delta.content };
        }
      }
    }

    return {
      iterator: iterate(),
      getUsage: () => ({ inputTokens, outputTokens }),
    };
  }
}
