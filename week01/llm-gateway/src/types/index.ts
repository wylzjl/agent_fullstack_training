import type { z } from 'zod';
import {
  MessageSchema,
  PromptSelectionSchema,
  LLMRequestSchema,
  UsageSchema,
  LLMResponseSchema,
  PromptTemplateSchema,
  ModelConfigSchema,
  CallTraceSchema,
} from './schemas';

/** 单条对话消息，隔离供应商消息格式差异 */
export type Message = z.infer<typeof MessageSchema>;

/** 受控模板选择指令，调用方只能选版本和传变量，不能篡改模板内容 */
export type PromptSelection = z.infer<typeof PromptSelectionSchema>;

/**
 * 统一 Gateway 请求协议。
 * Zod .refine() 在运行时校验 stream + responseSchema 互斥；
 * 此处通过 z.output 保留 .default() 后的输出类型。
 */
export type LLMRequest = z.output<typeof LLMRequestSchema>;

/** 输入与输出 Token 统计，用于成本和用量治理 */
export type Usage = z.infer<typeof UsageSchema>;

/** 统一模型调用结果，作为响应出口的校验契约 */
export type LLMResponse = z.infer<typeof LLMResponseSchema>;

/** 由 Gateway 发布和版本化管理的系统 Prompt 模板资产 */
export type PromptTemplate = z.infer<typeof PromptTemplateSchema>;

/** 将平台模型名映射为供应商模型、地址、密钥与能力配置 */
export type ModelConfig = z.infer<typeof ModelConfigSchema>;

/** 单次调用审计记录，保存模型、Token、成本、延迟与状态 */
export type CallTrace = z.infer<typeof CallTraceSchema>;
