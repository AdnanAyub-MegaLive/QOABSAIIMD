import assert from 'node:assert/strict';
import { fork, spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import { io } from 'socket.io-client';
import { createRedisRuntime } from '../../src/lib/scaling/redis-runtime.js';

// This runner never reads .env, DATABASE_URL, or production credentials.
const root = await mkdtemp(join(tmpdir(), 'mega-scaling-lab-'));
const namespace = 'lab_' + randomUUID().replaceAll('-', '');
const password = randomUUID();
const workers = [], sockets = [];
const results = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function port() { const server = createServer(); await new Promise(r => server.listen(0, '127.0.0.1', r)); const p = server.address().port; await new Promise(r => server.close(r)); return p; }
const postgresPort = await port(), redisPort = await port();
const database = new EmbeddedPostgres({ databaseDir: join(root, 'postgres'), user: 'postgres', password, port: postgresPort, persistent: false, autoRehydrateSymlinks: true, postgresFlags: ['-h','127.0.0.1'], onLog: () => {}, onError: () => {} });
let redis, pool;
function startWorker() {
  return new Promise((resolve,reject) => {
    const child = fork(new URL('./lab-worker.mjs', import.meta.url), [], { env: { PATH: process.env.PATH, HOME: process.env.HOME, SCALING_LAB_DATABASE_URL: `postgresql://postgres:${password}@127.0.0.1:${postgresPort}/scaling_lab`, SCALING_LAB_REDIS_URL: `redis://127.0.0.1:${redisPort}`, SCALING_LAB_NAMESPACE: namespace }, stdio: ['ignore','ignore','inherit','ipc'] });
    const pending = new Map(); let sequence = 0;
    const startup = setTimeout(() => reject(Error('Worker startup timeout')), 15000);
    const worker = { child, call(command, args) { return new Promise((res,rej) => { const id = ++sequence; const timer = setTimeout(() => { pending.delete(id); rej(Error('Worker command timeout: ' + command)); }, 10000); pending.set(id, { res,rej,timer }); child.send({ id, command, args }); }); } };
    workers.push(worker);
    child.on('error', reject);
    child.on('exit', () => { clearTimeout(startup); for (const p of pending.values()) { clearTimeout(p.timer); p.rej(Error('Worker exited')); } pending.clear(); });
    child.on('message', message => {
      if (message.ready) { clearTimeout(startup); worker.port = message.port; resolve(worker); return; }
      const p = pending.get(message.id); if (!p) return; pending.delete(message.id); clearTimeout(p.timer);
      if (message.error) p.rej(Error(message.error)); else p.res(message.value);
    });
  });
}
async function eventually(check, timeoutMs = 5000) { const end = Date.now() + timeoutMs; while (Date.now() < end) { if (await check()) return; await sleep(20); } throw Error('Condition timed out'); }
try {
  await database.initialise(); await database.start(); await database.createDatabase('scaling_lab');
  pool = new pg.Pool({ connectionString: `postgresql://postgres:${password}@127.0.0.1:${postgresPort}/scaling_lab`, max: 2 });
  await pool.query(`CREATE TABLE scaling_outbox (id text PRIMARY KEY, channel text NOT NULL, event text NOT NULL, payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), delivered_at timestamptz, attempts integer NOT NULL DEFAULT 0);
    CREATE TABLE scaling_connections (id text PRIMARY KEY, room_id text NOT NULL, user_id text NOT NULL, active boolean NOT NULL);
    CREATE TABLE scaling_presence (room_id text PRIMARY KEY, users integer NOT NULL, revision bigint NOT NULL);
    CREATE TABLE scaling_job_runs (id text PRIMARY KEY);`);
  redis = spawn(process.env.REDIS_SERVER_BIN || 'redis-server', ['--bind','127.0.0.1','--port',String(redisPort),'--save','','--appendonly','no','--dir',root], { stdio: ['ignore','pipe','pipe'] });
  await new Promise((resolve,reject) => { const timer = setTimeout(() => reject(Error('Redis startup timeout')), 10000); redis.once('error', e => { clearTimeout(timer); reject(e); }); redis.stdout.on('data', b => { if (String(b).includes('Ready to accept connections')) { clearTimeout(timer); resolve(); } }); });
  const isolated = await createRedisRuntime({ url: `redis://127.0.0.1:${redisPort}`, namespace: namespace + '_other' });
  try { await isolated.set('grace', 'isolated', 60000); } finally { await isolated.close(); }
  await Promise.all(Array.from({ length: 4 }, () => startWorker()));
  assert.equal(await workers[0].call('get', { key: 'grace' }), null);
  results.push('Independent Redis namespaces do not share temporary state');
  for (const [index, worker] of workers.entries()) {
    const socket = io(`http://127.0.0.1:${worker.port}`, { auth: { userId: 'fixture-' + index }, transports: ['websocket'], reconnection: false }); sockets.push(socket);
    await new Promise((resolve,reject) => { socket.once('joined', resolve); socket.once('connect_error', reject); });
  }
  const received = sockets.map(() => new Set()), rawCounts = sockets.map(() => 0);
  sockets.forEach((socket,i) => socket.on('lab:event', data => { rawCounts[i]++; received[i].add(data.eventId); }));
  await workers[0].call('broadcast', { eventId: 'cross-process' });
  await eventually(() => received.every(s => s.has('cross-process')));
  assert.equal((await workers[2].call('sockets')).length, 4);
  results.push('Broadcast and presence queries reach clients on all four processes');
  const limits = await Promise.all(Array.from({ length: 40 }, (_,i) => workers[i % 4].call('rate')));
  assert.equal(limits.filter(x => !x).length, 6);
  const seq = await Promise.all(Array.from({ length: 40 }, (_,i) => workers[i % 4].call('sequence')));
  assert.equal(new Set(seq).size, 40);
  await workers[0].call('set', { key: 'grace', value: { expires: true }, ttl: 150 });
  assert.deepEqual(await workers[1].call('get', { key: 'grace' }), { expires: true });
  await sleep(180); assert.equal(await workers[2].call('get', { key: 'grace' }), null);
  results.push('Shared six-action limit, unique sequences and expiring state work across processes');
  const presence = { connectionId: 'connection-1', roomId: 'room-1', userId: 'user-1', joined: true };
  await Promise.all(workers.map(w => w.call('presence', presence)));
  assert.equal((await pool.query('SELECT users FROM scaling_presence')).rows[0].users, 1);
  await workers[1].call('presence', { ...presence, connectionId: 'connection-2' });
  await Promise.all(workers.map(w => w.call('presence', { ...presence, joined: false })));
  assert.equal((await pool.query('SELECT users FROM scaling_presence')).rows[0].users, 1);
  await workers[2].call('presence', { ...presence, connectionId: 'connection-2', joined: false });
  await workers[3].call('presence', presence); // delayed retry cannot resurrect a disconnected connection
  assert.equal((await pool.query('SELECT users FROM scaling_presence')).rows[0].users, 0);
  results.push('Duplicate joins/leaves and late join retries preserve atomic distinct-user counts');
  const jobs = await Promise.all(workers.map(w => w.call('job', { delay: 0.4 })));
  assert.equal(jobs.filter(Boolean).length, 1);
  assert.equal((await pool.query('SELECT count(*) FROM scaling_job_runs')).rows[0].count, '1');
  results.push('Only one process owns a concurrent background job');
  await pool.query("INSERT INTO scaling_outbox(id,channel,event,payload) SELECT 'event-' || n, 'lab-room', 'lab:event', '{}'::jsonb FROM generate_series(1,80) n");
  const counts = await Promise.all(workers.map(w => w.call('dispatch')));
  assert.equal(counts.reduce((a,b) => a+b,0),80);
  await eventually(() => received.every(s => s.size === 81));
  assert(rawCounts.every(n => n === 81));
  results.push('Concurrent outbox consumers claim disjoint rows without duplicate normal delivery');
  await pool.query("INSERT INTO scaling_outbox VALUES ('retry-event','lab-room','lab:event','{}',now(),NULL,0)");
  await assert.rejects(workers[0].call('dispatch', { failAfterSend: true }), /INJECTED/);
  await eventually(() => received.every(s => s.has('retry-event')));
  await workers[1].call('dispatch'); await eventually(() => rawCounts.every(n => n === 83));
  assert(received.every(s => s.size === 82));
  results.push('Send-before-commit failure retries with the same event ID; deduplicating consumers apply once');
  await new Promise(resolve => { redis.once('exit', resolve); redis.kill('SIGTERM'); });
  await eventually(async () => { try { await workers[0].call('rate'); return false; } catch (e) { return /Shared state unavailable/.test(e.message); } });
  results.push('Redis outage fails shared-state operations closed');
  redis = spawn(process.env.REDIS_SERVER_BIN || 'redis-server', ['--bind','127.0.0.1','--port',String(redisPort),'--save','','--appendonly','no','--dir',root], { stdio: 'ignore' });
  await eventually(async () => { try { return (await workers[1].call('sockets')).length === 4; } catch { return false; } }, 15000);
  await workers[0].call('broadcast', { eventId: 'redis-recovered' });
  await eventually(() => received.every(s => s.has('redis-recovered')));
  results.push('Cross-process queries and broadcasts recover after Redis restarts');
  const leaders = await Promise.all(workers.map(w => w.call('leader')));
  assert.equal(leaders.filter(Boolean).length, 1);
  const leaderIndex = leaders.indexOf(true);
  await workers[leaderIndex].call('leaderJob', { id: 'leader-cycle' });
  results.push('One dedicated database leader owns the background-job runner');
  // Kill a transaction owner, then prove another worker can acquire the lock.
  const dead = workers[0].call('job', { delay: 8 }).catch(() => {});
  await sleep(150); workers[0].child.kill('SIGKILL'); await dead;
  await eventually(async () => await workers[1].call('job', { delay: 0 }), 12000);
  results.push('Process death releases the database job lock and permits takeover');
  if (leaderIndex !== 0) workers[leaderIndex].child.kill('SIGKILL');
  const survivor = workers.find((w,i) => i !== 0 && i !== leaderIndex);
  await eventually(() => survivor.call('leader'));
  await survivor.call('leaderJob', { id: 'leader-takeover' });
  results.push('Background leader ownership transfers after the elected process dies');
  await writeFile(new URL('./latest-results.json', import.meta.url), JSON.stringify({ at: new Date().toISOString(), processes: 4, database: 'fresh local PostgreSQL', productionAccess: false, passed: results, limitations: ['Foundation harness, not a full portal or phone test', 'Existing portal timers, expiry handling and memory-state callers still require migration', 'No production peak-hour event-loop/database telemetry collected yet'] }, null, 2) + '\n');
  console.log(JSON.stringify({ passed: results }, null, 2));
} finally {
  sockets.forEach(s => s.close());
  for (const w of workers) if (w.child.exitCode === null && w.child.signalCode === null) await w.call('stop').catch(() => w.child.kill('SIGKILL'));
  if (redis) { redis.kill('SIGTERM'); await new Promise(resolve => { if (redis.exitCode !== null) resolve(); else redis.once('exit',resolve); }); }
  if (pool) await pool.end();
  await database.stop().catch(() => {});
  await rm(root, { recursive: true, force: true });
}
