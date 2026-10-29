import { Client } from 'pg';
// Dedicated session connection required: LISTEN cannot use transaction pooling.
// The existing 250ms/1s/2s timers remain recovery paths during reconnects.
export function startConfirmedRealtimeListener({ connectionString, wallet, announcements, notifications }) {
  let client, retry, closed = false, failures = 0;
  const pending = new Set();
  let scheduled = false;
  function wake(kind) {
    if (closed) return;
    if (kind === 'room') kind = 'wallet'; // Both share the numeric outbox.
    pending.add(kind);
    if (scheduled) return;
    scheduled = true;
    setImmediate(() => {
      scheduled = false;
      if (closed) return;
      const kinds = [...pending]; pending.clear();
      for (const kind of kinds) {
        const handler = kind === 'announcements' ? announcements : kind === 'notifications' ? notifications : wallet;
        void Promise.resolve().then(handler).catch(error => console.error('Post-commit dispatch failed', { kind, code: error.code ?? 'DISPATCH_FAILED' }));
      }
    });
  }
  async function connect() {
    if (closed) return;
    const next = new Client({ connectionString, connectionTimeoutMillis: 5000 });
    client = next;
    let disconnected = false;
    const reconnect = error => {
      if (disconnected || closed) return; disconnected = true;
      if (failures === 0) console.warn('Post-commit listener unavailable; polling remains active', { code: error?.code ?? 'CONNECTION_CLOSED' });
      void next.end().catch(() => {});
      retry = setTimeout(connect, Math.min(30000, 1000 * 2 ** Math.min(failures++, 5))); retry.unref?.();
    };
    next.on('error', reconnect); next.on('end', reconnect);
    next.on('notification', message => { if (message.channel === 'portal_confirmed_realtime') wake(message.payload); });
    try { await next.connect(); await next.query('LISTEN portal_confirmed_realtime'); failures = 0; wake('wallet'); wake('announcements'); wake('notifications'); }
    catch (error) { reconnect(error); }
  }
  void connect();
  return async () => { closed = true; clearTimeout(retry); await client?.end().catch(() => {}); };
}
