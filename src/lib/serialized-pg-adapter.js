// A transaction has one PostgreSQL connection. Queue its queries explicitly;
// unrelated transactions and pooled reads remain concurrent.
export function serializeTransaction(tx) {
  let tail = Promise.resolve();
  for (const name of ['queryRaw', 'executeRaw', 'commit', 'rollback']) {
    const method = tx[name].bind(tx);
    tx[name] = (...args) => {
      const result = tail.then(() => method(...args));
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
