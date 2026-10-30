import { giftOutboxContext } from './gift-outbox-context.js';
// A transaction has one PostgreSQL connection. Queue its queries explicitly;
// unrelated transactions and pooled reads remain concurrent.
export function serializeTransaction(tx) {
  let tail = Promise.resolve();
  for (const name of ['queryRaw', 'executeRaw', 'commit', 'rollback']) {
    const method = tx[name].bind(tx);
    tx[name] = (...args) => {
      const result = tail.then(async () => {
        const context = process.env.REALTIME_TIMINGS === 'true' ? giftOutboxContext.getStore() : null;
        if (!context) return method(...args);
        const started = performance.now();
        try { return await method(...args); }
        finally {
          try {
          // No SQL text/parameters or account identifiers in diagnostics.
          const sql = args[0]?.sql ?? '';
          const table = /(?:FROM|INTO|UPDATE)\s+"?(?:public"?\.)?"?([A-Za-z_]+)/i.exec(sql)?.[1] ?? /^[A-Z]+/.exec(sql)?.[0] ?? name;
          const timings = context.queryTimings ??= {};
          const entry = timings[table] ??= { count: 0, ms: 0, maxMs: 0 };
          const ms = performance.now() - started;
          entry.count++; entry.ms += ms; entry.maxMs = Math.max(entry.maxMs, ms);
          } catch { /* Diagnostics cannot change transaction outcomes. */ }
        }
      });
      // A failed query must still allow ROLLBACK to run.
      tail = result.catch(() => {});
      return result;
    };
  }
  return tx;
}
export function serializePgTransactions(factory) {
  const connect = factory.connect.bind(factory);
  factory.connect = async (...args) => {
    const adapter = await connect(...args);
    const start = adapter.startTransaction.bind(adapter);
    adapter.startTransaction = async (...options) => serializeTransaction(await start(...options));
    return adapter;
  };
  return factory;
}
