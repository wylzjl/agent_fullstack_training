/** 调用审计日志，支持控制台输出 + 内存存储，预留持久化扩展接口 */

import type { CallTrace } from '../types/index.ts';

/** 审计日志输出接口，便于后续扩展持久化存储 */
export interface AuditSink {
  write(trace: CallTrace): void | Promise<void>;
}

/** 控制台审计输出 */
class ConsoleAuditSink implements AuditSink {
  write(trace: CallTrace): void {
    console.log('[AUDIT]', JSON.stringify(trace, null, 2));
  }
}

/** 内存存储审计输出，用于 /v1/trace 端点查询 */
class MemoryAuditSink implements AuditSink {
  private readonly traces: CallTrace[] = [];
  private readonly maxTraces = 1000;

  write(trace: CallTrace): void {
    this.traces.push(trace);
    // 超出上限时移除最早的记录
    if (this.traces.length > this.maxTraces) {
      this.traces.shift();
    }
  }

  getTraces(): CallTrace[] {
    return [...this.traces];
  }

  clear(): void {
    this.traces.length = 0;
  }
}

/** 审计日志管理器 */
export class AuditLogger {
  private readonly sinks: AuditSink[] = [new ConsoleAuditSink()];
  private readonly memorySink: MemoryAuditSink;

  constructor() {
    this.memorySink = new MemoryAuditSink();
    this.sinks.push(this.memorySink);
  }

  /** 注册额外的审计输出 */
  addSink(sink: AuditSink): void {
    this.sinks.push(sink);
  }

  /** 记录一次调用审计（异步，不阻塞响应） */
  log(trace: CallTrace): void {
    for (const sink of this.sinks) {
      try {
        Promise.resolve(sink.write(trace)).catch((err) => {
          console.error('[AuditLogger] sink write failed:', err);
        });
      } catch (error) {
        console.error('[AuditLogger] sink write failed:', error);
      }
    }
  }

  /** 获取内存中存储的审计日志列表 */
  getTraces(): CallTrace[] {
    return this.memorySink.getTraces();
  }

  /** 清空内存中的审计日志 */
  clearTraces(): void {
    this.memorySink.clear();
  }
}

/** 全局单例，供路由层读取审计日志 */
export const auditLogger = new AuditLogger();
