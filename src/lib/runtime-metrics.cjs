const { monitorEventLoopDelay, performance } = require('node:perf_hooks');
const { AsyncLocalStorage } = require('node:async_hooks');
const fs = require('node:fs');
const path = require('node:path');
const stateKey = Symbol.for('portal.runtimeMetrics');
const state = globalThis[stateKey] ??= { context: new AsyncLocalStorage(), observer: null };

// Match checked-in routes, never log arbitrary URL segments, queries or headers.
function routeMatcher(root) {
  const routes = [];
  function walk(dir, parts = []) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(path.join(dir, entry.name), [...parts, entry.name]);
      else if (/^route\.[cm]?[jt]sx?$/.test(entry.name)) {
        const visible = parts.filter(p => !p.startsWith('(') && !p.startsWith('@'));
        const source = visible.map(p => p.startsWith('[[...') ? '(?:/.*)?' : p.startsWith('[...') ? '/.+' : p.startsWith('[') ? '/[^/]+' : '/' + p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('');
        routes.push({ pattern: new RegExp('^' + source + '/?$'), label: '/' + visible.join('/'), weight: visible.filter(p => !p.startsWith('[')).length });
      }
    }
  }
  walk(root);
  routes.sort((a,b) => b.weight - a.weight);
  return url => {
    const pathname = String(url || '/').split('?')[0];
    if (pathname.startsWith('/socket.io')) return '/socket.io';
    if (pathname.startsWith('/_next/')) return '/_next/*';
    return routes.find(r => r.pattern.test(pathname))?.label ?? (pathname.startsWith('/api/') ? '/api/unknown' : '/web-or-static');
  };
}
function createMetrics({ classify, write = entry => console.info(JSON.stringify(entry)), now = () => performance.now(), maxGroups = 512 } = {}) {
  let groups = new Map();
  function record(key, ms, failed = false) {
    if (!groups.has(key) && groups.size >= maxGroups) key = 'overflow';
    const item = groups.get(key) ?? { count: 0, failed: 0, totalMs: 0, maxMs: 0, buckets: Array(9).fill(0) };
    item.count++; item.failed += Number(failed); item.totalMs += ms; item.maxMs = Math.max(item.maxMs, ms);
    const boundaries = [10,50,100,250,500,1000,2000,4000];
    const bucket = boundaries.findIndex(b => ms <= b);
    item.buckets[bucket < 0 ? 8 : bucket]++;
    groups.set(key, item);
  }
  function database(operation, ms, failed) {
    record('db:' + operation, ms, failed);
    const context = state.context.getStore();
    if (context) { context.dbMs += ms; context.dbCalls++; }
  }
  function request(req, res, handle) {
    const started = now();
    const route = classify(req.url);
    const method = ['GET','POST','PUT','PATCH','DELETE','OPTIONS','HEAD'].includes(req.method) ? req.method : 'OTHER';
    const context = { dbMs: 0, dbCalls: 0 };
    let recorded = false;
    function finish() {
      if (recorded) return;
      recorded = true;
      const ms = now() - started;
      const cancelled = !res.writableFinished;
      const status = cancelled ? 499 : res.statusCode;
      record(`http:${method}:${route}:${status}`, ms, cancelled || status >= 500);
      if (cancelled || ms >= 1000 || status >= 500) safeWrite({ type: 'portal_request', at: new Date().toISOString(), pid: process.pid, method, route, status, cancelled, ms, ...context });
    }
    res.once('finish', finish); res.once('close', finish);
    return state.context.run(context, handle);
  }
  function safeWrite(entry) { try { write(entry); } catch { /* Observability cannot fail a request. */ } }
  function flush(extra = {}) {
    const snapshot = Object.fromEntries(groups); groups = new Map();
    safeWrite({ type: 'portal_metrics', at: new Date().toISOString(), pid: process.pid, bucketUpperMs: [10,50,100,250,500,1000,2000,4000,null], groups: snapshot, ...extra });
    return snapshot;
  }
  return { request, database, flush };
}
function startMetrics({ root = path.join(process.cwd(), 'src/app'), intervalMs = 60000, write } = {}) {
  if (process.env.PORTAL_METRICS !== 'true') return { request: (_req,_res,handle) => handle(), stop() {} };
  const metrics = createMetrics({ classify: routeMatcher(root), write });
  state.observer = metrics;
  const delay = monitorEventLoopDelay({ resolution: 20 }); delay.enable();
  let utilization = performance.eventLoopUtilization();
  const timer = setInterval(() => {
    const current = performance.eventLoopUtilization();
    metrics.flush({ eventLoop: { p95Ms: delay.percentile(95)/1e6, maxMs: delay.max/1e6, utilization: performance.eventLoopUtilization(current, utilization).utilization }, memory: process.memoryUsage() });
    utilization = current; delay.reset();
  }, intervalMs); timer.unref();
  return { request: metrics.request, stop() { clearInterval(timer); delay.disable(); metrics.flush(); if (state.observer === metrics) state.observer = null; } };
}
async function measureDatabase(operation, call) {
  const observer = state.observer;
  if (!observer) return call();
  const started = performance.now(); let failed = false;
  try { return await call(); } catch (error) { failed = true; throw error; }
  finally { try { observer.database(operation, performance.now() - started, failed); } catch { /* diagnostic only */ } }
}
module.exports = { routeMatcher, createMetrics, startMetrics, measureDatabase };
