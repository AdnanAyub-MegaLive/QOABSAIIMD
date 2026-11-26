import { Client } from 'pg';
// One elected scheduler across the deployment. Financial jobs still retain
// their existing database idempotency keys, row locks and unique constraints.
export async function createBackgroundCoordinator({ connectionString, enabled, onLost = () => process.exit(1), intervalMs = 1000 }) {
  if (!enabled) return { run: (_name, fn) => Promise.resolve().then(fn), ready: () => true, leader: () => true, stop: async () => {} };
  const client = new Client({ connectionString, connectionTimeoutMillis: 5000, query_timeout: 5000,
    keepAlive: true, keepAliveInitialDelayMillis: 1000, application_name: 'portal-background-leader' });
  let owned = false, healthy = false, closing = false, checking = false;
  const running = new Map();
  function failed() {
    healthy = false;
    // Fail-stop: do not let an old scheduler keep writing after losing its lock.
    // Normal deployment uses stop(), which waits for jobs before releasing it.
    if (!closing) { owned = false; onLost(); }
  }
  client.on('error', failed); client.on('end', failed);
  await client.connect();
  async function check() {
    if (checking || closing) return;
    checking = true;
    try {
      if (owned) await client.query('SELECT 1');
      else owned = (await client.query("SELECT pg_try_advisory_lock(hashtextextended('portal:background-scheduler',0)) AS owned")).rows[0].owned;
      healthy = true;
    } catch { failed(); } finally { checking = false; }
  }
  await check();
  const timer = setInterval(check, intervalMs); timer.unref();
  return {
    ready: () => healthy && !closing,
    leader: () => owned && healthy && !closing,
    run(name, fn) {
      if (!owned || !healthy || closing || running.has(name)) return Promise.resolve(false);
      const promise = Promise.resolve().then(fn).finally(() => running.delete(name));
      running.set(name, promise); return promise;
    },
    async stop() {
      closing = true; clearInterval(timer);
      await Promise.allSettled([...running.values()]);
      owned = false; healthy = false; await client.end();
    },
  };
}
