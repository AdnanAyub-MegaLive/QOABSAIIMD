// Exercise the actual production entry point without access to application data.
// Requires an existing successful `npm run build`.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { readdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const reservation = createServer(socket => socket.destroy());
await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
const databasePort = reservation.address().port;
const httpReservation = createServer();
await new Promise(resolve => httpReservation.listen(0, '127.0.0.1', resolve));
const port = httpReservation.address().port;
await new Promise(resolve => httpReservation.close(resolve));
const database = `postgresql://startup:startup@127.0.0.1:${databasePort}/startup?connect_timeout=1`;
const temporary = await mkdtemp(path.join(tmpdir(), 'portal-startup-'));
const preload = path.join(temporary, 'database-stub.cjs');
// Startup restores timers from database rows. Supply an empty database at the
// module boundary, retaining the real Next server, Socket.IO and other imports.
await writeFile(preload, `
const {registerHooks}=require('node:module');
registerHooks({load(url,context,next){
 if(url.endsWith('/src/lib/prisma.js'))return {format:'module',shortCircuit:true,source:
  'const model=new Proxy({}, {get:(_,key)=>async()=>key==="findMany"||key==="groupBy"?[]:key==="count"?0:key==="updateMany"||key==="deleteMany"?{count:0}:null}); export const prisma=new Proxy({}, {get:(_,key)=>key==="$transaction"?async fn=>typeof fn==="function"?fn(prisma):Promise.all(fn):key==="$queryRaw"||key==="$queryRawUnsafe"?async()=>[]:key==="$executeRaw"?async()=>0:model});'};
 return next(url,context);
}});
`);
const child = spawn(process.execPath, ['--require', preload, 'server.js'], {
  cwd: process.cwd(),
  env: { ...process.env, NODE_ENV: 'production', HOSTNAME: '127.0.0.1', PORT: String(port),
    DATABASE_URL: database, REALTIME_DATABASE_URL: database },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
let timer;
try {
  await new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error('Server did not become ready within 45 seconds.')), 45000);
    const read = chunk => {
      output = (output + chunk.toString()).slice(-16000);
      if (output.includes('Portal and Socket.IO ready on')) resolve();
    };
    child.stdout.on('data', read);
    child.stderr.on('data', read);
    child.once('error', reject);
    child.once('exit', code => reject(new Error(`Server exited before readiness (${code}).`)));
  });
  clearTimeout(timer);
  const files = await readdir('.next/static', { recursive: true });
  const file = files.find(name => name.endsWith('.css') || name.endsWith('.js'));
  if (!file) throw new Error('Build has no static asset to verify.');
  const response = await fetch(`http://127.0.0.1:${port}/_next/static/${file.split(path.sep).join('/')}`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok || !(await response.arrayBuffer()).byteLength) {
    throw new Error(`Static asset request failed (${response.status}).`);
  }
  console.log('PASS: production server reaches HTTP/Socket.IO readiness and serves a built asset (HTTP 200).');
  console.log('Database calls used an empty stub; direct database connections were isolated to a local rejecting socket. No application records were accessed.');
} catch (error) {
  console.error(error.message);
  console.error(output);
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
  if (child.exitCode === null) {
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.kill('SIGKILL');
    await exited;
  }
  reservation.close();
  await rm(temporary, { recursive: true, force: true });
}
