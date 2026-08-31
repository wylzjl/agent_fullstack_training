import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuditLogger } from '../../../src/core/AuditLogger.ts';
import type { AuditSink } from '../../../src/core/AuditLogger.ts';
import { mockCallTrace } from '../../helpers/fixtures.ts';

describe('AuditLogger', () => {
  let logger: AuditLogger;

  beforeEach(() => {
    logger = new AuditLogger();
  });

  it('log() 写入后可通过 getTraces() 读取', () => {
    logger.log(mockCallTrace);
    const traces = logger.getTraces();
    expect(traces).toHaveLength(1);
    expect(traces[0].requestId).toBe(mockCallTrace.requestId);
  });

  it('多条记录按顺序存储', () => {
    logger.log({ ...mockCallTrace, requestId: 'first' });
    logger.log({ ...mockCallTrace, requestId: 'second' });
    logger.log({ ...mockCallTrace, requestId: 'third' });

    const traces = logger.getTraces();
    expect(traces).toHaveLength(3);
    expect(traces[0].requestId).toBe('first');
    expect(traces[2].requestId).toBe('third');
  });

  it('超过 1000 条时移除最早的记录', () => {
    for (let i = 0; i < 1001; i++) {
      logger.log({ ...mockCallTrace, requestId: `trace-${i}` });
    }

    const traces = logger.getTraces();
    expect(traces.length).toBe(1000);
    // 最早的记录（trace-0）应被移除
    expect(traces[0].requestId).toBe('trace-1');
  });

  it('clearTraces() 清空所有记录', () => {
    logger.log(mockCallTrace);
    logger.log({ ...mockCallTrace, requestId: 'another' });
    expect(logger.getTraces()).toHaveLength(2);

    logger.clearTraces();
    expect(logger.getTraces()).toHaveLength(0);
  });

  it('log() 返回 void，不抛异常', () => {
    expect(() => logger.log(mockCallTrace)).not.toThrow();
  });

  it('自定义 sink 被调用', async () => {
    const mockSink: AuditSink = { write: vi.fn() };
    logger.addSink(mockSink);

    logger.log(mockCallTrace);

    // 等待异步写入
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(mockSink.write).toHaveBeenCalledWith(mockCallTrace);
  });

  it('getTraces() 返回副本，不影响内部状态', () => {
    logger.log(mockCallTrace);
    const traces = logger.getTraces();
    traces.push({ ...mockCallTrace, requestId: 'injected' });

    // 内部状态不受影响
    expect(logger.getTraces()).toHaveLength(1);
  });

  it('sink 写入失败不抛异常', async () => {
    const failingSink: AuditSink = {
      write: () => { throw new Error('sink error'); },
    };
    logger.addSink(failingSink);

    // 不应抛出
    expect(() => logger.log(mockCallTrace)).not.toThrow();

    // 内存存储仍正常工作
    expect(logger.getTraces()).toHaveLength(1);
  });
});
