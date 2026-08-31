import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../src/app.ts';

describe('GET /health', () => {
  it('返回 200 和健康状态', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.timestamp).toBeDefined();
    expect(typeof res.body.uptime).toBe('number');
    expect(res.body.uptime).toBeGreaterThanOrEqual(0);
  });
});
