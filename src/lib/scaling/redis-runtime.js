import { createClient } from 'redis';
import { createAdapter } from '@socket.io/redis-adapter';
import { createHash, randomUUID } from 'node:crypto';

const slidingWindow = `
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now - tonumber(ARGV[1]))
if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[2]) then return 1 end
redis.call('ZADD', KEYS[1], now, ARGV[3])
redis.call('PEXPIRE', KEYS[1], ARGV[1])
return 0`;
const sequence = `local n = redis.call('INCR', KEYS[1]); redis.call('PEXPIRE', KEYS[1], ARGV[1]); return n`;

// Explicit namespace prevents a test cluster from sending events to production.
export async function createRedisRuntime({ url, namespace, onError = () => {} }) {
  if (!url || !/^[a-zA-Z0-9_-]{1,64}$/.test(namespace ?? '')) throw new Error('Redis URL and explicit namespace are required');
  const client = createClient({ url, disableOfflineQueue: true, socket: { connectTimeout: 3000, reconnectStrategy: retries => Math.min(100 * 2 ** Math.min(retries, 5), 3000) } });
  const publisher = client.duplicate(), subscriber = client.duplicate();
  const clients = [client, publisher, subscriber];
  for (const connection of clients) connection.on('error', () => onError('REDIS_UNAVAILABLE'));
  try { await Promise.all(clients.map(c => c.connect())); }
  catch (error) { for (const c of clients) if (c.isOpen) c.destroy(); throw error; }
  const key = (kind, value) => `${namespace}:${kind}:${createHash('sha256').update(String(value)).digest('hex')}`;
  const ready = () => clients.every(c => c.isReady);
  function assertReady() { if (!ready()) throw Object.assign(new Error('Shared state unavailable'), { code: 'REDIS_UNAVAILABLE' }); }
  function ttl(value) { if (!Number.isSafeInteger(value) || value < 1 || value > 86400000) throw new Error('TTL must be between 1 ms and 24 hours'); return value; }
  return {
    ready,
    attach(io) { assertReady(); io.adapter(createAdapter(publisher, subscriber, { key: `${namespace}:socket`, requestsTimeout: 3000, publishOnSpecificResponseChannel: true })); },
    async isRateLimited(value, { limit, windowMs }) {
      assertReady(); ttl(windowMs);
      if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('Invalid rate limit');
      return (await client.eval(slidingWindow, { keys: [key('rate', value)], arguments: [String(windowMs), String(limit), randomUUID()] })) === 1;
    },
    async set(value, data, ttlMs) { assertReady(); await client.set(key('temporary', value), JSON.stringify(data), { PX: ttl(ttlMs) }); },
    async get(value) { assertReady(); const result = await client.get(key('temporary', value)); return result === null ? null : JSON.parse(result); },
    async remove(value) { assertReady(); await client.del(key('temporary', value)); },
    async nextSequence(value, ttlMs) { assertReady(); return client.eval(sequence, { keys: [key('sequence', value)], arguments: [String(ttl(ttlMs))] }); },
    async close() { for (const c of clients) if (c.isOpen) c.destroy(); },
  };
}
