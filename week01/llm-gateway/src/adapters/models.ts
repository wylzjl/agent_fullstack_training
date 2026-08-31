import { ModelConfig } from '../types';

export const MODEL_CONFIGS: Record<string, ModelConfig> = {
    "general-primary": {
        providerModel: process.env.PRIMARY_PROVIDER_MODEL || "deepseek-v4-flash",
        baseUrl: process.env.PRIMARY_BASE_URL || "https://api.deepseek.com",
        apiKeyEnv: "PRIMARY_API_KEY",
        supportsStructuredOutput:true,
        structuredOutputMode:"json_object",
        rateLimit: {
            ratePerSecond: 1,
            capacity: 5,  // 每个模型每秒最多处理5个请求
            scope: 'model',
            tokenCost: 'request',
            enabled: true,
        },
    },
    "general-backup": {
        providerModel: process.env.BACKUP_PROVIDER_MODEL || "deepseek-chat",
        baseUrl: process.env.BACKUP_BASE_URL || "https://api.deepseek.com",
        apiKeyEnv: "BACKUP_API_KEY",
        supportsStructuredOutput:true,
        structuredOutputMode:"json_object",
        rateLimit: {
            ratePerSecond: 1,
            capacity: 5,  // 每个模型每秒最多处理5个请求
            scope: 'model',
            tokenCost: 'request',
            enabled: true,
        },
    },
}