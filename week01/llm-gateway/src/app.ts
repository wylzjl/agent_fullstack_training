/** Express 应用初始化 + 中间件注册 */

import express, { type Express } from 'express';
import { requestIdMiddleware } from './middleware/requestId.ts';
import { errorHandler } from './middleware/errorHandler.ts';
import healthRouter from './routes/health.ts';
import chatCompletionsRouter from './routes/chatCompletions.ts';
import responsesRouter from './routes/responses.ts';
import messagesRouter from './routes/messages.ts';
import traceRouter from './routes/trace.ts';

const app: Express = express();

// 解析 JSON 请求体
app.use(express.json());

// 中间件链：requestId → routes → errorHandler
app.use(requestIdMiddleware);

// 注册路由
app.use(healthRouter);
app.use(chatCompletionsRouter);
app.use(responsesRouter);
app.use(messagesRouter);
app.use(traceRouter);

// 全局错误处理（必须放在路由之后）
app.use(errorHandler);

export default app;
