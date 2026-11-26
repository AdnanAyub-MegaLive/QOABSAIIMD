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
    attach(io) { assertReady(); io.adapter(createAdapter(publisher, subscriber, { key: `${namespace}:socket`, requestsTimeout: 5000, publishOnSpecificResponseChannel: true })); io.on('portal:durable', (message, ack) => { try { io.local.to(message.channel).emit(message.event, message.payload); ack(true); } catch { ack(false); } }); },
    async publish(io, channel, event, payload) {
      assertReady();
      io.local.to(channel).emit(event, payload);
      const responses = await io.serverSideEmitWithAck('portal:durable', {channel,event,payload});
      if (responses.some(value => value !== true)) throw new Error('REMOTE_DELIVERY_FAILED');
      assertReady();
    },
    async isRateLimited(value, { limit, windowMs }) {
      assertReady(); ttl(windowMs);
      if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('Invalid rate limit');
      return (await client.eval(slidingWindow, { keys: [key('rate', value)], arguments: [String(windowMs), String(limit), randomUUID()] })) === 1;
    },
    async giftPresence(userId,roomId,action,now=Date.now()) {
      assertReady();
      return client.eval(`
local raw=redis.call('GET',KEYS[1]); local items=raw and cjson.decode(raw) or {}; local now=tonumber(ARGV[2]); local kept={}
for _,item in ipairs(items) do if item.leftAt==cjson.null or now-item.leftAt<=125000 then table.insert(kept,item) end end
if ARGV[1]=='join' then table.insert(kept,{joinedAt=now,leftAt=cjson.null})
elseif ARGV[1]=='leave' then for i=#kept,1,-1 do if kept[i].leftAt==cjson.null then kept[i].leftAt=now;break end end
elseif ARGV[1]=='remove' then for _,item in ipairs(kept) do item.removed=true end end
while #kept>5 do table.remove(kept,1) end
redis.call('SET',KEYS[1],cjson.encode(kept),'PX',86400000)
return 1`,{keys:[key('gift-presence',userId+'|'+roomId)],arguments:[action,String(now)]});
    },
    async giftIntervals(userId,roomId) {assertReady();const raw=await client.get(key('gift-presence',userId+'|'+roomId));return raw?Object.values(JSON.parse(raw)):[];},
    async currentSequence(value) {assertReady();return Number(await client.get(key('sequence',value)))||0;},
    async setGrace(roomId, publicId, until) { assertReady(); const k=key('grace',roomId);await client.multi().zAdd(k,[{score:until,value:publicId}]).pExpire(k,65000).exec(); },
    async graceUntil(roomId,publicId) { assertReady();return Number(await client.zScore(key('grace',roomId),publicId))||0; },
    async clearGrace(roomId,publicId) { assertReady();await client.zRem(key('grace',roomId),publicId); },
    async graceUsers(roomId) { assertReady();const k=key('grace',roomId);await client.zRemRangeByScore(k,0,Date.now());return client.zRangeByScore(k,Date.now(),'+inf'); },
    async set(value, data, ttlMs) { assertReady(); await client.set(key('temporary', value), JSON.stringify(data), { PX: ttl(ttlMs) }); },
    async get(value) { assertReady(); const result = await client.get(key('temporary', value)); return result === null ? null : JSON.parse(result); },
    async remove(value) { assertReady(); await client.del(key('temporary', value)); },
    async nextSequence(value, ttlMs) { assertReady(); return client.eval(sequence, { keys: [key('sequence', value)], arguments: [String(ttl(ttlMs))] }); },
    async close() { for (const c of clients) if (c.isOpen) c.destroy(); },
  };
}
