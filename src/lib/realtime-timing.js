import { randomUUID } from 'node:crypto';
export function realtimeTiming(pipeline, requestId = null) {
  if (process.env.REALTIME_TIMINGS !== 'true') return () => {};
  const correlationId = randomUUID(), started = performance.now();
  let previous = started;
  return stage => {
    const now = performance.now();
    // Diagnostics must never turn a committed financial operation into a failure.
    try { console.info('Realtime timing', { pipeline, correlationId, requestId, stage, at: new Date().toISOString(), elapsedMs: +(now - started).toFixed(3), stageMs: +(now - previous).toFixed(3) }); } catch { /* best effort */ }
    previous = now;
  };
}
