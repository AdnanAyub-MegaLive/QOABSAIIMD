import assert from 'node:assert/strict';
import { fork, spawn, execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
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
const workers = [], sockets = [], portals = [];
const results = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function port() { const server = createServer(); await new Promise(r => server.listen(0, '127.0.0.1', r)); const p = server.address().port; await new Promise(r => server.close(r)); return p; }
const postgresPort = await port(), redisPort = await port();
const database = new EmbeddedPostgres({ databaseDir: join(root, 'postgres'), user: 'postgres', password, port: postgresPort, persistent: false, autoRehydrateSymlinks: true, postgresFlags: ['-h','127.0.0.1','-c','timezone=UTC'], onLog: () => {}, onError: () => {} });
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
  const databaseUrl = `postgresql://postgres:${password}@127.0.0.1:${postgresPort}/scaling_lab`;
  // Legacy migration history starts after initial provisioning. Generate the
  // current schema, then install the actual attendance function used below.
  const schema=execFileSync(process.execPath,['node_modules/prisma/build/index.js','migrate','diff','--from-empty','--to-schema','prisma/schema.prisma','--script'],{
    env:{PATH:process.env.PATH,HOME:process.env.HOME,DATABASE_URL:databaseUrl},encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:120000
  });
  pool.on('error',error=>console.error('Lab pool error:',error.code));
  await pool.query(schema);
  const attendance=await readFile(new URL('../../prisma/migrations/20261030210000_audio_mic_attendance/migration.sql',import.meta.url),'utf8');
  await pool.query(`CREATE UNIQUE INDEX "AudioRoomMicSession_open_seat" ON "AudioRoomMicSession"("seatRecordId") WHERE "endedAt" IS NULL`);
  await pool.query(attendance.slice(attendance.indexOf('CREATE FUNCTION refresh_audio_mic_attendance')));
  await pool.query(`CREATE TABLE scaling_outbox (id text PRIMARY KEY, channel text NOT NULL, event text NOT NULL, payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), delivered_at timestamptz, attempts integer NOT NULL DEFAULT 0);
    CREATE TABLE scaling_connections (id text PRIMARY KEY, room_id text NOT NULL, user_id text NOT NULL, active boolean NOT NULL);
    CREATE TABLE scaling_presence (room_id text PRIMARY KEY, users integer NOT NULL, revision bigint NOT NULL);
    CREATE TABLE scaling_job_runs (id text PRIMARY KEY);`);
  await pool.query(`INSERT INTO "User" (id,"publicId",name,"updatedAt") SELECT 'actual-'||n,'fixture-'||n,'Fixture',now() FROM generate_series(0,3) n;
    INSERT INTO "AudioRoom" (id,"roomId","ownerId",title,"updatedAt") VALUES ('actual-room-id','actual-room','actual-0','Fixture room',now());`);
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
  const actualCounts = await Promise.all(workers.map(w=>w.call('actualPresence')));
  assert(actualCounts.every(n=>n===4));
  assert.equal((await pool.query(`SELECT "participantCount" FROM "AudioRoom" WHERE id='actual-room-id'`)).rows[0].participantCount,4);
  assert.equal(await workers[2].call('actualRelease'),false);
  results.push('Production presence transactions count all four processes and refuse to release an occupied room');
  const actualLeaders=await Promise.all(workers.map(w=>w.call('actualLeader')));
  assert.equal(actualLeaders.filter(Boolean).length,1);
  results.push('Production background coordinator elects exactly one scheduler');
  await workers[0].call('giftPresence',{userId:'fixture-0',action:'join',now:Date.now()-100});
  await workers[1].call('giftPresence',{userId:'fixture-0',action:'leave',now:Date.now()});
  assert.equal((await workers[2].call('giftIntervals',{userId:'fixture-0'})).length,1);
  await workers[3].call('giftPresence',{userId:'fixture-0',action:'remove',now:Date.now()});
  assert.equal((await workers[0].call('giftIntervals',{userId:'fixture-0'}))[0].removed,true);
  results.push('Production gift presence and removal state are shared across workers');
  const durable=sockets.map(()=>new Set()),durableCounts=sockets.map(()=>0);
  sockets.forEach((socket,i)=>socket.on('actual:event',data=>{durable[i].add(data.eventId);durableCounts[i]++;}));
  await pool.query(`INSERT INTO "RealtimeOutbox" (id,channel,event,payload) SELECT 'actual-event-'||n,'lab-room','actual:event','{}'::jsonb FROM generate_series(1,40)n`);
  const claimed=await Promise.all(workers.map(w=>w.call('actualDispatch')));
  assert.equal(claimed.reduce((a,b)=>a+b,0),40);
  await eventually(()=>durableCounts.every(n=>n===40));
  await pool.query(`INSERT INTO "RealtimeOutbox" (id,channel,event,payload) VALUES ('actual-retry','lab-room','actual:event','{}')`);
  await assert.rejects(workers[0].call('actualDispatch',{failAfterSend:true}),/INJECTED/);
  await workers[1].call('actualDispatch');
  await eventually(()=>durableCounts.every(n=>n===42));
  assert(durable.every(events=>events.size===41));
  results.push('Production outbox SQL claims and acknowledged fanout deliver once normally and retain stable IDs on retry');
  await pool.query(`UPDATE "User" SET status='BANNED' WHERE id IN ('actual-1','actual-2');
    INSERT INTO "Ban" (id,target,"userId",reason,"expiresAt") VALUES ('expired-one','USER','actual-1','fixture',now()-interval '1 minute'),('expired-two','USER','actual-2','fixture',now()-interval '1 minute'),('active-two','USER','actual-2','fixture',now()+interval '1 hour');
    INSERT INTO "AudioRoomSeatInvitation" (id,"audioRoomId","inviterId","targetId","seatId","expiresAt") VALUES ('expired-invite','actual-room-id','actual-0','actual-1','owner',now()-interval '1 minute');
    UPDATE "AudioRoom" SET "joiningDisabled"=true,"joiningDisabledUntil"=now()-interval '1 minute' WHERE id='actual-room-id';`);
  await workers[0].call('actualExpiry');
  const statuses=(await pool.query(`SELECT id,status FROM "User" WHERE id IN ('actual-1','actual-2') ORDER BY id`)).rows;
  assert.deepEqual(statuses,[{id:'actual-1',status:'ACTIVE'},{id:'actual-2',status:'BANNED'}]);
  assert.equal((await pool.query(`SELECT status FROM "AudioRoomSeatInvitation" WHERE id='expired-invite'`)).rows[0].status,'EXPIRED');
  assert.equal((await pool.query(`SELECT "joiningDisabled" FROM "AudioRoom" WHERE id='actual-room-id'`)).rows[0].joiningDisabled,false);
  await workers[1].call('actualExpiry');
  await pool.query(`UPDATE "User" SET status='ACTIVE' WHERE id='actual-2';DELETE FROM "Ban" WHERE id='active-two'`);
  results.push('Database expiry sweep restores expired bans, preserves overlapping bans and expires invitations and room restrictions idempotently');
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
  if (process.env.FULL_PORTAL_LAB === '1') {
    for (const worker of workers) if (worker.child.exitCode===null&&worker.child.signalCode===null) await worker.call('stop');
    const foldSql=await readFile(new URL('../../prisma/migrations/20261116121000_room_received_diamonds/migration.sql',import.meta.url),'utf8');
    const foldFunction=foldSql.match(/CREATE OR REPLACE FUNCTION portal_fold_room_gift_deltas[\s\S]*?\$\$;/);
    if(foldFunction)await pool.query(foldFunction[0]);
    const authSecret=randomUUID()+randomUUID();
    const {createHmac}=await import('node:crypto');
    function token(index){const body=Buffer.from(JSON.stringify({userId:'fixture-'+index,sessionVersion:0,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');return body+'.'+createHmac('sha256',authSecret).update(body).digest('base64url');}
    const bcrypt = (await import('bcrypt')).default;
    const staffPassword = randomUUID();
    await pool.query('INSERT INTO "Admin" (id,name,email,"passwordHash",role,active,"updatedAt") VALUES ($1,$2,$3,$4,$5,true,NOW())', ['lab-staff','Lab Staff','staff@scaling.test',await bcrypt.hash(staffPassword, 10),'ADMIN']);
    const staffCookies = new Map();
    async function staffRequest(base,path,options={}) {
      const response=await fetch(base+path,{...options,redirect:'manual',headers:{Cookie:[...staffCookies].map(([k,v])=>k+'='+v).join('; '),...options.headers}});
      for(const cookie of response.headers.getSetCookie()) { const pair=cookie.split(';')[0];const split=pair.indexOf('=');staffCookies.set(pair.slice(0,split),pair.slice(split+1)); }
      return response;
    }
    for(let i=0;i<2;i++){
      const portalPort=await port();
      const child=spawn(process.execPath,['server.js'],{env:{PATH:process.env.PATH,HOME:process.env.HOME,NODE_ENV:'production',HOSTNAME:'127.0.0.1',PORT:String(portalPort),DATABASE_URL:databaseUrl,AUTH_SECRET:authSecret,AUTH_TRUST_HOST:'true',NEXT_PUBLIC_BUSINESS_TIMEZONE_CUTOVER_AT:'2030-01-01T00:00:00.000Z',PORTAL_REDIS_URL:`redis://127.0.0.1:${redisPort}`,PORTAL_REDIS_NAMESPACE:namespace,PORTAL_METRICS:'true'},stdio:['ignore','pipe','pipe']});
      const portal={child,port:portalPort,output:''};portals.push(portal);
      child.stdout.on('data',data=>portal.output+=data);child.stderr.on('data',data=>portal.output+=data);
      await eventually(async()=>{if(child.exitCode!==null)throw Error('Portal exited: '+portal.output.slice(-3000));try{return(await fetch(`http://127.0.0.1:${portalPort}/internal/ready`)).ok;}catch{return false;}},60000);
      const response=await fetch(`http://127.0.0.1:${portalPort}/api/health`);assert.equal(response.status,200);assert.equal((await response.json()).data.status,'ready');
      const base=`http://127.0.0.1:${portalPort}`;
      if(i===0){
        const csrf=await (await staffRequest(base,'/api/auth/csrf')).json();
        const login=await staffRequest(base,'/api/auth/callback/credentials',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrfToken:csrf.csrfToken,email:'staff@scaling.test',password:staffPassword,callbackUrl:base+'/dashboard'})});
        assert.ok(!String(login.headers.get('location')).includes('error='),'Staff credentials must not be rejected');
      }
      const staffSession=await (await staffRequest(base,'/api/auth/session')).json();
      assert.equal(staffSession.user?.id,'lab-staff','Real credentials login must create a staff session valid on both workers');
      const profile=await fetch(`http://127.0.0.1:${portalPort}/api/v1/users/fixture-${i}/profile`,{headers:{Authorization:`Bearer ${token(i)}`}});
      assert.equal(profile.status,200,'Authenticated profile route uses initialized shared rate limiter');
      const socket=io(`http://127.0.0.1:${portalPort}`,{auth:{token:token(i)},transports:['websocket'],reconnection:false});sockets.push(socket);
      await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Actual portal session timeout: '+portal.output.slice(-3000))),15000);socket.once('session:status',()=>{clearTimeout(timer);resolve();});socket.once('connect_error',error=>{clearTimeout(timer);reject(error);});});
    }
    results.push('Real admin credentials login through CSRF/callback creates a session accepted by both Redis-enabled workers');
    results.push('Two built portal servers pass readiness, authenticated HTTP with shared rate limits and authenticated Socket.IO initialization');
    const first=portals[0];first.child.kill('SIGTERM');
    await eventually(()=>first.child.exitCode!==null,60000);
    assert.equal(first.child.exitCode,0);
    assert.equal((await fetch(`http://127.0.0.1:${portals[1].port}/internal/ready`)).status,200);
    results.push('Actual portal SIGTERM drains and exits cleanly while the second process remains ready');
    for(const portal of portals)await writeFile(join(root,`portal-${portal.port}.log`),portal.output);
  }
  await writeFile(new URL('./latest-results.json', import.meta.url), JSON.stringify({ at: new Date().toISOString(), processes: 4, database: 'fresh local PostgreSQL', productionAccess: false, passed: results, limitations: ['Actual shared-state modules and built HTTP/Socket.IO servers tested; physical two-phone testing not performed', 'Production peak-hour observation is still required'] }, null, 2) + '\n');
  console.log(JSON.stringify({ passed: results }, null, 2));
} catch(error) { console.error('LAB FAILURE',error.message,error.stack); throw error; } finally {
  sockets.forEach(s => s.close());
  for(const portal of portals)if(portal.child.exitCode===null){portal.child.kill("SIGTERM");await eventually(()=>portal.child.exitCode!==null,60000).catch(()=>portal.child.kill("SIGKILL"));}
  for (const w of workers) if (w.child.exitCode === null && w.child.signalCode === null) await w.call('stop').catch(() => w.child.kill('SIGKILL'));
  if (redis) { redis.kill('SIGTERM'); await new Promise(resolve => { if (redis.exitCode !== null) resolve(); else redis.once('exit',resolve); }); }
  if (pool) await pool.end();
  await database.stop().catch(() => {});
  await rm(root, { recursive: true, force: true });
}
