/** 提示词版本管理：模板查找 + 变量替换 */

import type { Message, PromptSelection } from '../types/index.ts';
import { PROMPT_TEMPLATES } from '../prompt/index.ts';
import { GatewayError } from '../errors/index.ts';

/** 解析 Prompt 模板，返回注入到 messages 头部的 system 消息 */
export function resolvePrompt(prompt: PromptSelection): Message[] {
  const key = `${prompt.name}_${prompt.version}`;
  const template = PROMPT_TEMPLATES[key];

  if (!template) {
    throw GatewayError.invalidRequest(`Prompt 模板未找到: ${key}`);
  }

  // 变量替换：${variable_name} → variables[variable_name]
  // 未提供值的占位符保持原样不替换
  const resolved = template.systemTemplate.replace(/\$\{(\w+)\}/g, (match, varName) => {
    return prompt.variables[varName] ?? match;
  });

  return [{ role: 'system', content: resolved }];
}
