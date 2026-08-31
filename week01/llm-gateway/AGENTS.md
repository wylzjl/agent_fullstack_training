# AGENTS.md

This file provides guidance to Lingma (lingma.aliyun.com) when working with code in this repository.

## Build & Run Commands

```bash
# Install dependencies
pnpm install

# Development mode (hot reload via tsx watch)
pnpm dev

# Build (TypeScript compilation, output to dist/)
pnpm build

# Production mode
pnpm start

# Full integration test (requires running server on port 8000)
bash test-gateway.sh

# Retry/fallback test (requires running server)
bash test-retry.sh
```

No unit test framework is configured. The `pnpm test` script is a placeholder.

## Environment Setup

Copy `.env.example` to `.env` and fill in API keys. The `.env` file is loaded at startup via `dotenv/config` in `src/server.ts` — this import must remain the **first import** in that file.

Key environment variables: `PORT` (default 8000), `PRIMARY_API_KEY`, `PRIMARY_BASE_URL`, `PRIMARY_PROVIDER_MODEL`, `BACKUP_API_KEY`, `BACKUP_BASE_URL`, `BACKUP_PROVIDER_MODEL`.

## Architecture Overview

This is a TypeScript ESM LLM gateway that provides a unified API for calling multiple LLM providers. It uses Express for HTTP, Zod for runtime validation, and official OpenAI/Anthropic SDKs for upstream calls.

### Request Lifecycle

```
Client → requestId middleware → requestValidator (Zod) → Route handler
       → Gateway.execute / executeStream
           → PromptManager (template resolution)
           → RateLimiter (per-model token bucket)
           → Adapter selection (factory based on baseUrl)
           → Adapter.chat / chatStream (with RetryHandler)
           → Fallback to backup model (if primary exhausts retries)
           → AuditLogger (async, dual sink: console + memory)
       → JSON or SSE response
```

### Layer Responsibilities

**Routes** (`src/routes/`) — Each protocol has its own route file bound to a specific adapter type. Route files call `Gateway.execute()` (non-stream) or `Gateway.executeStream()` (stream). The route determines stream vs non-stream by URL path (`*/stream` suffix), not by request body.

**Gateway** (`src/core/Gateway.ts`) — Central orchestrator. Resolves prompt templates, checks rate limits, creates adapters via factory, handles retry + fallback logic, and records audit traces. Has two execution modes: `execute()` for JSON responses and `executeStream()` for SSE.

**Adapters** (`src/adapters/`) — Implement the `ModelAdapter` interface (`chat`, `chatStream`, `supports`). The factory function `createAdapter()` in `ModelAdapter.ts` selects the adapter based on `config.baseUrl` (URLs containing "anthropic" → `AnthropicMessageAdapter`, otherwise → `OpenAICompatibleAdapter`). `OpenAIResponsesAdapter` exists but is only used via explicit `createAdapterByType()`.

**Model Registry** (`src/adapters/models.ts`) — `MODEL_CONFIGS` maps platform model keys (e.g., `general-primary`) to provider model name, base URL, API key env var, structured output config, and rate limit settings. Fallback mapping is hardcoded in `Gateway.getFallbackKey()` (`general-primary` → `general-backup`).

**Core modules:**
- `RateLimiter.ts` — In-memory token bucket, one bucket per model key
- `RetryHandler.ts` — Generic `withRetry()` wrapper: exponential backoff with jitter, max 3 retries, 4xx errors are not retried
- `AuditLogger.ts` — Singleton with dual sinks (console + memory). Memory sink capped at 1000 traces. Exposes `getTraces()`/`clearTraces()` for the `/v1/trace` endpoint
- `PromptManager.ts` — Resolves `prompt.name` + `prompt.version` to a template in `PROMPT_TEMPLATES`, performs `${variable}` substitution, returns system message to prepend

### Type System

Types are defined as Zod schemas in `src/types/schemas.ts` and exported as inferred TypeScript types in `src/types/index.ts`. This provides both runtime validation and compile-time type safety. Key types: `LLMRequest`, `LLMResponse`, `ModelConfig`, `CallTrace`, `Message`, `PromptTemplate`.

### Key Patterns

- **Stream chunk differentiation**: `StreamChunk` has a `type` field (`'content'` | `'reasoning'`) to distinguish main text from thinking/reasoning process in SSE events.
- **TTFT tracking**: `Gateway.wrapWithTtft()` wraps the stream iterator to record time-to-first-token on the first chunk arrival.
- **Error handling**: All errors go through `GatewayError` with an `ErrorCode` and `httpStatus`. The `errorHandler` middleware maps these to uniform JSON responses. `ZodError` → 400, unknown errors → 500.
- **Request validation**: `createRequestValidator(isStream)` is a factory — stream endpoints pass `isStream=true` to additionally reject `responseSchema`.
- **Express Request extensions**: `requestId` and `validatedRequest` are attached to Express `Request` via declaration merging in `middleware/requestValidator.ts` and `middleware/requestId.ts`.

### Extending the Gateway

**Add a new model**: Add entry to `MODEL_CONFIGS` in `src/adapters/models.ts` with provider model, base URL, API key env var, and rate limit config. Update `Gateway.getFallbackKey()` if fallback is needed.

**Add a new adapter**: Implement `ModelAdapter` interface, then register it in `createAdapter()` or `createAdapterByType()` in `src/adapters/ModelAdapter.ts`.

**Add a prompt template**: Add entry to `PROMPT_TEMPLATES` in `src/prompt/index.ts` with key format `{name}_{version}`. Template content uses `${variable_name}` placeholders.

## Important Conventions

- All imports use explicit `.ts` extensions (e.g., `import { X } from './foo.ts'`) since the project runs as ESM with `tsx`.
- `tsconfig.json` has `noEmit: true` — `pnpm build` runs `tsc` for type checking only; `tsx` handles actual execution.
- The `requestValidator` middleware is applied per-route (not globally), with `isStream` parameter matching the endpoint's stream semantics.
- `stream` and `responseSchema` are mutually exclusive — enforced by both Zod `.refine()` in schema and explicit check in stream validator.
