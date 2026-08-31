/** 网关主入口：路由分发 + Fallback + 编排 */

import type { LLMRequest, LLMResponse, ModelConfig, CallTrace, Message } from '../types/index.ts';
import type { InternalRequest, StreamResult, StreamChunk } from '../adapters/ModelAdapter.ts';
import { createAdapter } from '../adapters/ModelAdapter.ts';
import { MODEL_CONFIGS } from '../adapters/models.ts';
import { resolvePrompt } from './PromptManager.ts';
import { RateLimiter } from './RateLimiter.ts';
import { withRetry } from './RetryHandler.ts';
import { auditLogger as globalAuditLogger } from './AuditLogger.ts';
import { GatewayError, ErrorCode } from '../errors/index.ts';

export class Gateway {
  private readonly rateLimiter = new RateLimiter();
  private readonly auditLogger = globalAuditLogger;

  /** 非流式执行 */
  async execute(request: LLMRequest, requestId: string): Promise<LLMResponse> {
    const startTime = Date.now();

    // 1. PromptManager 解析模板
    const messages = this.resolveMessages(request);

    // 2. 查找模型配置
    const modelKey = request.model;
    const config = MODEL_CONFIGS[modelKey];
    if (!config) {
      throw GatewayError.invalidRequest(`未知模型: ${modelKey}`);
    }

    // 3. 限流检查
    this.checkRateLimit(modelKey, config);

    // 4. 创建适配器
    const adapter = createAdapter(config);

    // 5. 构造内部请求
    const internalRequest: InternalRequest = {
      messages,
      responseSchema: request.responseSchema,
      timeoutSeconds: request.timeoutSeconds,
    };

    // 6. 调用适配器（带重试）
    let response: LLMResponse;
    let actualModel = modelKey;
    let totalAttempts = 0;

    try {
      const { result, attempts } = await withRetry(
        () => adapter.chat(internalRequest, config, requestId),
        { maxRetries: 3 },
      );
      response = result;
      totalAttempts = attempts;
    } catch (err) {
      // 7. Fallback 到备用模型（4xx 客户端错误不触发 fallback）
      if (err instanceof GatewayError && err.httpStatus >= 400 && err.httpStatus < 500) {
        throw err;
      }

      const fallbackKey = this.getFallbackKey(modelKey);
      if (!fallbackKey) {
        throw err instanceof GatewayError ? err : GatewayError.modelUnavailable();
      }

      const fallbackConfig = MODEL_CONFIGS[fallbackKey];
      if (!fallbackConfig) {
        throw GatewayError.modelUnavailable();
      }

      // 对备用模型执行限流 + 重试
      this.checkRateLimit(fallbackKey, fallbackConfig);
      const fallbackAdapter = createAdapter(fallbackConfig);

      const { result, attempts } = await withRetry(
        () => fallbackAdapter.chat(internalRequest, fallbackConfig, requestId),
        { maxRetries: 3 },
      );
      response = result;
      actualModel = fallbackKey;
      totalAttempts += attempts;
    }

    // 8. 计算延迟
    const latencyMs = Date.now() - startTime;

    // 9. 记录审计
    const trace: CallTrace = {
      requestId,
      timestamp: new Date().toISOString(),
      requestedModel: modelKey,
      actualModel,
      promptName: request.prompt?.name ?? null,
      promptVersion: request.prompt?.version ?? null,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      costUsd: 0, // 预留成本计算
      ttftMs: 0,
      latencyMs,
      attempts: totalAttempts,
      status: 'success',
      errorCode: null,
    };
    this.auditLogger.log(trace);

    // 10. 返回响应
    return {
      ...response,
      model: actualModel,
      latencyMs,
      attempts: totalAttempts,
    };
  }

  /** 流式执行 */
  async executeStream(request: LLMRequest, requestId: string): Promise<{
    model: string;
    iterator: AsyncIterable<StreamChunk>;
    getUsage: () => { inputTokens: number; outputTokens: number };
    onEnd: () => void;
    onError: (errorCode: string) => void;
  }> {
    const startTime = Date.now();

    // 1. PromptManager 解析模板
    const messages = this.resolveMessages(request);

    // 2. 查找模型配置
    const modelKey = request.model;
    const config = MODEL_CONFIGS[modelKey];
    if (!config) {
      throw GatewayError.invalidRequest(`未知模型: ${modelKey}`);
    }

    // 3. 限流检查
    this.checkRateLimit(modelKey, config);

    // 4. 创建适配器
    const adapter = createAdapter(config);

    // 5. 构造内部请求
    const internalRequest: InternalRequest = {
      messages,
      responseSchema: null, // 流式不支持 responseSchema
      timeoutSeconds: request.timeoutSeconds,
    };

    // 6. 调用适配器流式接口
    let streamResult: StreamResult;
    let actualModel = modelKey;

    try {
      streamResult = await adapter.chatStream(internalRequest, config, requestId);
    } catch (err) {
      // 4xx 客户端错误不触发 fallback
      if (err instanceof GatewayError && err.httpStatus >= 400 && err.httpStatus < 500) {
        throw err;
      }

      // Fallback
      const fallbackKey = this.getFallbackKey(modelKey);
      if (!fallbackKey) {
        throw err instanceof GatewayError ? err : GatewayError.modelUnavailable();
      }

      const fallbackConfig = MODEL_CONFIGS[fallbackKey];
      if (!fallbackConfig) {
        throw GatewayError.modelUnavailable();
      }

      this.checkRateLimit(fallbackKey, fallbackConfig);
      const fallbackAdapter = createAdapter(fallbackConfig);
      streamResult = await fallbackAdapter.chatStream(internalRequest, fallbackConfig, requestId);
      actualModel = fallbackKey;
    }

    const { getUsage } = streamResult;

    // 7. 包装迭代器，记录 TTFT（首 Token 延迟）
    let ttftMs = 0;
    const wrappedIterator = this.wrapWithTtft(streamResult.iterator, startTime, (t) => { ttftMs = t; });

    const onEnd = () => {
      const usage = getUsage();
      const latencyMs = Date.now() - startTime;
      this.auditLogger.log({
        requestId,
        timestamp: new Date().toISOString(),
        requestedModel: modelKey,
        actualModel,
        promptName: request.prompt?.name ?? null,
        promptVersion: request.prompt?.version ?? null,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costUsd: 0,
        ttftMs,
        latencyMs,
        attempts: 1,
        status: 'success',
        errorCode: null,
      });
    };

    const onError = (errorCode: string) => {
      const usage = getUsage();
      const latencyMs = Date.now() - startTime;
      this.auditLogger.log({
        requestId,
        timestamp: new Date().toISOString(),
        requestedModel: modelKey,
        actualModel,
        promptName: request.prompt?.name ?? null,
        promptVersion: request.prompt?.version ?? null,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costUsd: 0,
        ttftMs,
        latencyMs,
        attempts: 1,
        status: 'failed',
        errorCode,
      });
    };

    return { model: actualModel, iterator: wrappedIterator, getUsage, onEnd, onError };
  }

  /** 解析 Prompt 模板，合并到 messages */
  private resolveMessages(request: LLMRequest): Message[] {
    if (!request.prompt) {
      return request.messages;
    }

    const systemMessages = resolvePrompt(request.prompt);
    return [...systemMessages, ...request.messages];
  }

  /** 限流检查 */
  private checkRateLimit(modelKey: string, config: ModelConfig): void {
    if (!config.rateLimit) return;

    const result = this.rateLimiter.checkRateLimit(modelKey, config.rateLimit);
    if (!result.allowed) {
      throw GatewayError.rateLimited(result.retryAfterSeconds ?? 1);
    }
  }

  /** 获取备用模型 key（从配置中查找，当前约定：primary → backup） */
  private getFallbackKey(modelKey: string): string | null {
    // 简单映射：general-primary → general-backup
    if (modelKey === 'general-primary') return 'general-backup';
    // 可扩展为从 config.fallback 字段读取
    return null;
  }

  /** 包装迭代器，在首个 chunk 到达时记录 TTFT */
  private wrapWithTtft(
    source: AsyncIterable<StreamChunk>,
    startTime: number,
    onTtft: (ms: number) => void,
  ): AsyncIterable<StreamChunk> {
    let firstTokenRecorded = false;

    return {
      [Symbol.asyncIterator]() {
        const inner = source[Symbol.asyncIterator]();
        return {
          async next() {
            const result = await inner.next();
            if (!firstTokenRecorded && !result.done && result.value) {
              firstTokenRecorded = true;
              onTtft(Date.now() - startTime);
            }
            return result;
          },
          async return(value?: unknown) {
            return inner.return?.(value) ?? { value: undefined, done: true as const };
          },
          async throw(err?: unknown) {
            return inner.throw?.(err) ?? { value: undefined, done: true as const };
          },
        };
      },
    };
  }
}
