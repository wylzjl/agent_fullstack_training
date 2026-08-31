# LLM 统一模型调用 Gateway

一个 TypeScript 实现的 LLM 统一网关服务，对上层业务提供标准化的模型调用接口，内部屏蔽多家供应商 API 协议差异。

## 核心能力

- **多协议适配** — 统一接口封装 OpenAI Chat Completion、OpenAI Responses、Anthropic Messages 三种协议
- **动态模型路由** — 根据请求中的模型 key 自动路由到对应供应商适配器
- **自动故障转移** — 主模型不可用时自动切换到备用模型，业务无感知
- **独立限流** — 基于令牌桶算法，每个模型 key 独立限流配置
- **指数退避重试** — 网络错误 / 5xx / 超时自动重试，最多 3 次
- **结构化输出** — 支持 JSON Schema 约束，自动转换为供应商对应的结构化输出参数
- **流式响应** — SSE (Server-Sent Events) 透传模型流式输出
- **提示词版本管理** — 内置模板注册表，支持模板引用 + 变量替换，业务方无需传递完整 system prompt
- **调用审计** — 每次调用记录完整 Trace（Token 消耗、延迟、状态、模型路由等）

## 技术栈

| 项          | 选型                          |
| ----------- | ----------------------------- |
| 运行时      | Node.js (ESM)                |
| 语言        | TypeScript                    |
| Web 框架    | Express                       |
| 参数校验    | Zod                           |
| HTTP 客户端 | openai / @anthropic-ai/sdk    |
| 包管理      | pnpm                          |

## 项目结构

```
src/
├── types/
│   ├── index.ts              # 类型导出
│   └── schemas.ts            # Zod Schema 定义
├── adapters/
│   ├── ModelAdapter.ts       # 适配器接口 + 工厂函数
│   ├── OpenAICompatibleAdapter.ts
│   ├── OpenAIResponsesAdapter.ts
│   ├── AnthropicMessageAdapter.ts
│   └── models.ts             # 模型配置注册表
├── prompt/
│   └── index.ts              # Prompt 模板注册表
├── core/
│   ├── Gateway.ts            # 网关主入口，路由 + 编排
│   ├── RateLimiter.ts        # 令牌桶限流器
│   ├── RetryHandler.ts       # 指数退避重试
│   ├── AuditLogger.ts        # 调用审计日志
│   └── PromptManager.ts      # 提示词版本管理
├── routes/
│   ├── chatCompletions.ts    # /v1/chat/completions 路由
│   ├── responses.ts          # /v1/responses 路由
│   ├── messages.ts           # /v1/messages 路由
│   ├── trace.ts              # /v1/trace 审计日志查询
│   └── health.ts             # /health 健康检查
├── middleware/
│   ├── errorHandler.ts       # 全局错误处理
│   ├── requestValidator.ts   # 请求参数校验
│   └── requestId.ts          # 请求 ID 注入
├── errors/
│   └── index.ts              # 统一错误码 + 自定义异常
├── app.ts                    # Express 应用初始化
└── server.ts                 # HTTP Server 启动入口
```

## 快速开始

### 安装依赖

```bash
pnpm install
```

### 环境变量配置

在项目根目录创建 `.env` 文件：

```env
# 服务端口（默认 8000）
PORT=8000

# 主模型配置
PRIMARY_API_KEY=your_primary_api_key
PRIMARY_PROVIDER_MODEL=deepseek-v4-flash
PRIMARY_BASE_URL=https://api.deepseek.com

# 备用模型配置
BACKUP_API_KEY=your_backup_api_key
BACKUP_PROVIDER_MODEL=deepseek-chat
BACKUP_BASE_URL=https://api.deepseek.com
```

### 启动服务

```bash
# 开发模式（热重载）
pnpm dev

# 生产模式
pnpm build
pnpm start
```

## API 接口

### 端点列表

| 方法   | 路径                          | 说明                     | 响应类型   |
| ------ | ----------------------------- | ------------------------ | ---------- |
| POST   | `/v1/chat/completions`        | OpenAI Chat 协议调用     | JSON       |
| POST   | `/v1/chat/completions/stream` | OpenAI Chat 流式调用     | SSE        |
| POST   | `/v1/responses`               | OpenAI Responses 协议调用| JSON       |
| POST   | `/v1/responses/stream`        | OpenAI Responses 流式调用| SSE        |
| POST   | `/v1/messages`                | Anthropic Messages 调用  | JSON       |
| POST   | `/v1/messages/stream`         | Anthropic Messages 流式  | SSE        |
| GET    | `/v1/trace`                   | 查询审计日志列表         | JSON       |
| DELETE | `/v1/trace`                   | 清空审计日志             | JSON       |
| GET    | `/health`                     | 健康检查                 | JSON       |

### 请求示例

#### 基础调用

```bash
curl -X POST http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "general-primary",
    "messages": [
      { "role": "system", "content": "You are a helpful assistant." },
      { "role": "user", "content": "你是什么模型？" }
    ],
    "timeoutSeconds": 30
  }'
```
#### 使用提示词模板

```bash
curl -X POST http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "general-backup",
    "messages": [
      { "role": "user", "content": "请查询退保规则" }
    ],
    "prompt": {
      "name": "knowledge_decision",
      "version": "v1",
      "variables": { "product_name": "XX保险" }
    }
  }'
```

#### 流式调用

```bash
curl -X POST http://localhost:8000/v1/chat/completions/stream \
  -H "Content-Type: application/json" \
  -d '{
    "model": "general-backup",
    "messages": [
      { "role": "user", "content": "用10个字总结一下Python的优点。" }
    ]
  }'
```

```bash
curl -X POST http://localhost:8000/v1/chat/completions/stream \
  -H "Content-Type: application/json" \
  -d '{
    "model": "general-primary",
    "messages": [
      { "role": "user", "content": "讲一个100字苏联冷笑话" }
    ]
  }'
```

#### 结构化输出

```bash
curl -X POST http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "general-backup",
    "messages": [
      { "role": "user", "content": "提取以下文本中的姓名和年龄：张三，25岁" }
    ],
    "responseSchema": {
      "type": "object",
      "properties": {
        "name": { "type": "string" },
        "age": { "type": "integer" }
      },
      "required": ["name", "age"]
    }
  }'
```
#### 结构化输出和流式响应冲突示例
```bash
curl -X POST http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "general-backup",
    "messages": [
      { "role": "user", "content": "提取以下文本中的姓名和年龄：张三，25岁" }
    ],
    "stream": true,
    "responseSchema": {
      "type": "object",
      "properties": {
        "name": { "type": "string" },
        "age": { "type": "integer" }
      },
      "required": ["name", "age"]
    }
  }'
```
### 响应格式

#### 非流式响应

```json
{
  "requestId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "model": "general-primary",
  "content": "你好！有什么可以帮助你的吗？",
  "parsed": null,
  "usage": { "inputTokens": 20, "outputTokens": 15 },
  "ttftMs": 320,
  "latencyMs": 1200,
  "attempts": 1
}
```

#### 流式响应 (SSE)

```
data: {"requestId":"f47ac10b-...","model":"general-primary","delta":"你","done":false}

data: {"requestId":"f47ac10b-...","model":"general-primary","delta":"好","done":false}

data: {"requestId":"f47ac10b-...","model":"general-primary","delta":"","done":true,"usage":{"inputTokens":20,"outputTokens":15}}
```

#### 审计日志查询

```bash
# 查询所有审计日志
curl http://localhost:8000/v1/trace

# 查询最近 10 条审计日志
curl http://localhost:8000/v1/trace?limit=10

# 清空内存中的审计日志
curl -X DELETE http://localhost:8000/v1/trace
```

审计日志响应格式：

```json
{
  "total": 5,
  "returned": 5,
  "traces": [
    {
      "requestId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "timestamp": "2026-08-31T10:00:00.000Z",
      "requestedModel": "general-primary",
      "actualModel": "general-primary",
      "promptName": null,
      "promptVersion": null,
      "inputTokens": 20,
      "outputTokens": 15,
      "costUsd": 0,
      "ttftMs": 320,
      "latencyMs": 1200,
      "attempts": 1,
      "status": "success",
      "errorCode": null
    }
  ]
}
```

### 错误响应

```json
{
  "error": {
    "code": "MODEL_UNAVAILABLE",
    "message": "所有模型均不可用，请稍后重试",
    "requestId": "f47ac10b-58cc-4372-a567-0e02b2c3d479"
  }
}
```

| 错误码              | HTTP 状态 | 说明                 |
| ------------------- | --------- | -------------------- |
| INVALID_REQUEST     | 400       | 请求参数校验失败     |
| AUTH_FAILED         | 401       | API Key 无效或过期   |
| RATE_LIMITED        | 429       | 触发限流             |
| MODEL_UNAVAILABLE   | 503       | 主备模型均不可用     |
| TIMEOUT             | 504       | 请求超时             |
| INTERNAL_ERROR      | 500       | 网关内部错误         |

## 架构设计

### 请求生命周期

```
客户端请求
    │
    ▼
┌─────────────────────────────────────────┐
│  Express HTTP 层                         │
│  ① requestId → ② requestValidator → ③ 路由│
└─────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────┐
│  Gateway 编排层                          │
│  ④ PromptManager 模板解析               │
│  ⑤ RateLimiter 限流检查                 │
│  ⑥ 模型路由 + 适配器选择                │
│  ⑦ Adapter.chat / chatStream            │
│  ⑧ RetryHandler 重试（失败时）          │
│  ⑨ Fallback 备用模型（重试耗尽时）      │
│  ⑩ AuditLogger 记录调用审计             │
└─────────────────────────────────────────┘
    │
    ▼
  返回响应（JSON / SSE）
```

### 模型与适配器映射

| 平台模型 key      | 供应商模型          | 适配器                    |
| ----------------- | -------------------- | ------------------------- |
| general-primary   | deepseek-v4-flash    | OpenAICompatibleAdapter   |
| general-backup    | deepseek-chat        | OpenAICompatibleAdapter   |

### 提示词模板

当前内置模板：

| 模板名称             | 版本 | 变量           | 说明             |
| -------------------- | ---- | -------------- | ---------------- |
| knowledge_decision   | v1   | product_name   | 知识库决策器     |

模板在 `src/prompt/index.ts` 中注册，支持 `${variable_name}` 占位符语法。

## 扩展指南

### 新增模型

在 `src/adapters/models.ts` 中添加配置：

```ts
export const MODEL_CONFIGS: Record<string, ModelConfig> = {
  // ... 现有配置
  "my-new-model": {
    providerModel: "model-name",
    baseUrl: "https://api.provider.com",
    apiKeyEnv: "NEW_MODEL_API_KEY",
    supportsStructuredOutput: true,
    structuredOutputMode: "json_object",
    rateLimit: {
      ratePerSecond: 2,
      capacity: 10,
      scope: "model",
      tokenCost: "request",
      enabled: true,
    },
  },
};
```

### 新增适配器

1. 在 `src/adapters/` 下创建新文件，实现 `ModelAdapter` 接口
2. 在 `src/adapters/ModelAdapter.ts` 的工厂函数中注册映射规则

## 许可证

MIT License
