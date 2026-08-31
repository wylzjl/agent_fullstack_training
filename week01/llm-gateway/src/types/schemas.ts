import { z } from 'zod';

/** 单条对话消息，隔离供应商消息格式差异 */
export const MessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string().min(1).max(20_000),
}).strict();

/** 受控模板选择指令，调用方只能选版本和传变量，不能篡改模板内容 */
export const PromptSelectionSchema = z.object({
  name: z.string().min(1).max(100),
  version: z.string().min(1).max(50),
  variables: z.record(z.string(), z.string()),
}).strict();

/**
 * 统一 Gateway 请求协议。
 * .refine() 在运行时校验 stream + responseSchema 的互斥约束，
 * 与 index.ts 中的判别联合类型互补：编译期 + 运行时双重保障。
 */
export const LLMRequestSchema = z.object({
  model: z.string().min(1).max(100),
  messages: z.array(MessageSchema).min(1).max(100),
  stream: z.boolean().default(false),
  responseSchema: z.record(z.string(), z.unknown()).nullable().default(null),
  timeoutSeconds: z.number().gt(0).lte(120).default(30),
  prompt: PromptSelectionSchema.nullable().default(null),
}).strict().refine(
  (data) => !(data.stream && data.responseSchema !== null),
  { message: 'stream 与 responseSchema 不能同时使用', path: ['responseSchema'] },
);

/** 输入与输出 Token 统计，用于成本和用量治理 */
export const UsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
}).strict();

/** 统一模型调用结果，作为响应出口的校验契约 */
export const LLMResponseSchema = z.object({
  requestId: z.string(),
  model: z.string(),
  content: z.string(),
  parsed: z.record(z.string(), z.unknown()).or(z.array(z.unknown())).nullable(), // 结构化解析结果，仅当 responseSchema 有效时填充
  usage: UsageSchema,
  ttftMs: z.number().int().nonnegative(), // 首 Token 延迟，单位毫秒
  latencyMs: z.number().int().nonnegative(), // 总延迟，单位毫秒
  attempts: z.number().int().min(1),
}).strict();

/** 由 Gateway 发布和版本化管理的系统 Prompt 模板资产 */
export const PromptTemplateSchema = z.object({
  name: z.string(),
  version: z.string(),
  systemTemplate: z.string(),
}).strict();

/** 将平台模型名映射为供应商模型、地址、密钥与能力配置 */
export const ModelConfigSchema = z.object({
  providerModel: z.string(),
  baseUrl: z.string(),
  apiKeyEnv: z.string(),
  supportsStructuredOutput: z.boolean(),
  structuredOutputMode: z.enum(['json_schema', 'json_object']),
  rateLimit: z.object({
    /** 令牌填充速率（令牌/秒），控制长期平均速率 */
    ratePerSecond: z.number(),
    /** 桶的最大容量，允许的突发流量大小 */
    capacity: z.number(),
    /** 限流维度 */
    scope: z.enum(['model', 'consumer', 'composite']).optional(),
    /** 每个请求消耗的令牌计算方式 */
    tokenCost: z.enum(['request', 'input_tokens', 'total_tokens']).optional(),
    /** 是否启用该限流策略 */
    enabled: z.boolean().optional(),
  }).optional(),
}).strict();

/** 单次调用审计记录，保存模型、Token、成本、延迟与状态 */
export const CallTraceSchema = z.object({
  requestId: z.string(),
  timestamp: z.string(),
  requestedModel: z.string(),
  actualModel: z.string().nullable(),
  promptName: z.string().nullable(),
  promptVersion: z.string().nullable(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  costUsd: z.number().nonnegative(),
  ttftMs: z.number(),
  latencyMs: z.number().int().nonnegative(),
  attempts: z.number().int().nonnegative(),
  status: z.enum(['success', 'failed']),
  errorCode: z.string().nullable(),
}).strict();
