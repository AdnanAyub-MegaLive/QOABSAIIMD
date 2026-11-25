// Every job's database writes must use the supplied connection. The advisory
// lock and writes then share one transaction: loss of ownership rolls back work.
// External side effects belong in a transactional outbox, never in this callback.
export async function runExclusiveJob(pool, name, job) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS owned', ['portal-job:' + name]);
    if (!rows[0].owned) { await client.query('ROLLBACK'); return false; }
    await job(client);
    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
}

// Row locks prevent two dispatchers claiming the same pending rows. A crash
// after send but before COMMIT can repeat a delivery: consumers MUST deduplicate
// the stable event ID. This is at-least-once dispatch, not exactly-once transport.
export async function dispatchBatch(pool, send, { batchSize = 50 } = {}) {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 100) throw new Error('Invalid batch size');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT id, channel, event, payload FROM scaling_outbox WHERE delivered_at IS NULL ORDER BY created_at, id LIMIT $1 FOR UPDATE SKIP LOCKED', [batchSize]);
    for (const row of rows) {
      await send({ ...row, payload: { ...row.payload, eventId: row.id } });
      await client.query('UPDATE scaling_outbox SET delivered_at = clock_timestamp(), attempts = attempts + 1 WHERE id = $1', [row.id]);
    }
    await client.query('COMMIT');
    return rows.length;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
}

// A connection identity makes retries idempotent. A count alone cannot tell a
// duplicate disconnect from a second real disconnect. Keep a short-lived
// tombstone; production retention must exceed the maximum reconnect window.
export async function updatePresence(pool, { connectionId, roomId, userId, joined }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', ['presence:' + roomId]);
    if (joined) {
      await client.query('INSERT INTO scaling_connections (id, room_id, user_id, active) VALUES ($1,$2,$3,true) ON CONFLICT (id) DO NOTHING', [connectionId, roomId, userId]);
    } else {
      await client.query('INSERT INTO scaling_connections (id, room_id, user_id, active) VALUES ($1,$2,$3,false) ON CONFLICT (id) DO UPDATE SET active = false', [connectionId, roomId, userId]);
    }
    const { rows } = await client.query('INSERT INTO scaling_presence (room_id, users, revision) SELECT $1, count(DISTINCT user_id), 1 FROM scaling_connections WHERE room_id = $1 AND active ON CONFLICT (room_id) DO UPDATE SET users = EXCLUDED.users, revision = scaling_presence.revision + 1 RETURNING users, revision', [roomId]);
    await client.query('COMMIT');
    return rows[0];
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {}); throw error;
  } finally { client.release(); }
}
