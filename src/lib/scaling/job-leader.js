// Preparation API: callbacks must use the supplied connection for all writes.
// Existing portal jobs cannot safely be wrapped until their database access is
// injectable. Publish external effects through an outbox in this transaction.
export async function tryJobLeader(pool, namespace) {
  const client = await pool.connect();
  let owned = false, stopped = false, tail = Promise.resolve();
  const lost = () => { owned = false; };
  client.on('error', lost);
  try {
    const result = await client.query('SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS owned', ['portal-leader:' + namespace]);
    owned = result.rows[0].owned;
    if (!owned) { client.removeListener('error', lost); client.release(); return null; }
  } catch (error) { client.removeListener('error', lost); client.release(true); throw error; }
  return {
    get owned() { return owned && !stopped; },
    run(job) {
      const result = tail.then(async () => {
        if (!owned || stopped) throw new Error('LEADER_UNAVAILABLE');
        try {
          await client.query('BEGIN');
          await job(client);
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK').catch(() => { owned = false; });
          throw error;
        }
      });
      tail = result.catch(() => {});
      return result;
    },
    async close() {
      if (stopped) return;
      stopped = true;
      await tail;
      // Destroying the connection drops the session lock even after errors.
      owned = false; client.removeListener('error', lost); client.release(true);
    },
  };
}
