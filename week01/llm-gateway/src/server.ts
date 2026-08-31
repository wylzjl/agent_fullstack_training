/** HTTP Server 启动入口 */

// 必须在所有其他导入之前加载 .env 环境变量
import 'dotenv/config';

import app from './app.ts';

const PORT = parseInt(process.env.PORT || '8000', 10);

app.listen(PORT, () => {
  console.log(`[LLM Gateway] 服务已启动，监听端口 ${PORT}`);
  console.log(`[LLM Gateway] 健康检查: http://localhost:${PORT}/health`);
  console.log(`[LLM Gateway] Chat Completions: http://localhost:${PORT}/v1/chat/completions`);
  console.log(`[LLM Gateway] Chat Completions Stream: http://localhost:${PORT}/v1/chat/completions/stream`);
});
