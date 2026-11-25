import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import metrics from './runtime-metrics.cjs';

describe('runtime measurements', () => {
  it('matches route templates without retaining IDs, signed URLs or unknown paths', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'routes-'));
    try {
      for (const route of ['api/users/[id]', 'api/users/me', 'api/media/[...path]']) {
        mkdirSync(path.join(root, route), { recursive: true }); writeFileSync(path.join(root, route, 'route.js'), '');
      }
      const classify = metrics.routeMatcher(root);
      expect(classify('/api/users/private-person?token=secret')).toBe('/api/users/[id]');
      expect(classify('/api/users/me')).toBe('/api/users/me');
      expect(classify('/api/media/a/b?signature=secret')).toBe('/api/media/[...path]');
      expect(classify('/api/secret-unknown')).toBe('/api/unknown');
    } finally { rmSync(root, { recursive: true }); }
  });
  it('records aborted responses once, separates failures and bounds aggregate storage', () => {
    const output = []; let time = 0;
    const m = metrics.createMetrics({ classify: () => '/api/test', now: () => time, write: x => output.push(x), maxGroups: 2 });
    const res = new EventEmitter(); res.statusCode = 200; res.writableFinished = false;
    expect(m.request({ method: 'GET', url: '/secret' }, res, () => 42)).toBe(42);
    time = 1200; res.emit('close'); res.emit('finish');
    expect(output[0]).toMatchObject({ status: 499, cancelled: true, ms: 1200 });
    expect(JSON.stringify(output)).not.toContain('secret');
    for (let i = 0; i < 100; i++) m.database('op' + i, 50, false);
    const groups = m.flush();
    expect(Object.keys(groups).length).toBeLessThanOrEqual(3);
    expect(groups['http:GET:/api/test:499'].count).toBe(1);
    expect(m.flush()).toEqual({});
  });
  it('records completed 500 responses without marking cancellation and tolerates writer failure', () => {
    const output = [];
    const m = metrics.createMetrics({ classify: () => '/api/test', write: x => { output.push(x); throw Error('disk'); } });
    const res = new EventEmitter(); res.statusCode = 500; res.writableFinished = true;
    m.request({ method: 'POST' }, res, () => {});
    expect(() => { res.emit('finish'); res.emit('close'); }).not.toThrow();
    expect(output).toHaveLength(1); expect(output[0]).toMatchObject({ status: 500, cancelled: false });
  });
  it('preserves database errors and values with instrumentation disabled', async () => {
    expect(await metrics.measureDatabase('query', async () => 7)).toBe(7);
    const error = Error('database');
    await expect(metrics.measureDatabase('query', async () => { throw error; })).rejects.toBe(error);
  });
});

it('attributes parallel database work to its own request context and publishes event-loop metrics', async () => {
  const previous = process.env.PORTAL_METRICS;
  process.env.PORTAL_METRICS = 'true';
  const output = [];
  const runtime = metrics.startMetrics({ root: '/nonexistent-route-fixtures', intervalMs: 25, write: x => output.push(x) });
  try {
    const responses = [0,1].map(() => Object.assign(new EventEmitter(), { statusCode: 500, writableFinished: true }));
    await Promise.all(responses.map((response, index) => runtime.request({ method: 'GET', url: '/private?secret=yes' }, response, async () => {
      for (let i = 0; i <= index; i++) await metrics.measureDatabase('pooled.queryRaw', async () => { await new Promise(r => setTimeout(r, 5)); return 'secret'; });
      response.emit('finish'); response.emit('close');
    })));
    await new Promise(r => setTimeout(r, 45));
    expect(output.filter(x => x.type === 'portal_request').map(x => x.dbCalls).sort()).toEqual([1,2]);
    expect(output.some(x => x.eventLoop?.p95Ms >= 0)).toBe(true);
    expect(JSON.stringify(output)).not.toContain('secret');
  } finally {
    runtime.stop();
    if (previous === undefined) delete process.env.PORTAL_METRICS; else process.env.PORTAL_METRICS = previous;
  }
});
