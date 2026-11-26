import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

// Run on the droplet after building an isolated release. Never prints PM2 env.
const release = path.resolve(process.argv[2] || '.');
const count = Number(process.argv[3] || 1);
if (![1, 2].includes(count)) throw Error('Only one or two processes are permitted before the observation gate.');
const upstream = '/etc/nginx/conf.d/megalive-upstream.conf';
const run = (cmd, args) => execFileSync(cmd, args, {encoding:'utf8', timeout:90000, stdio:['ignore','pipe','pipe']});
const list = () => JSON.parse(run('pm2', ['jlist']));
const current = list().filter(p => /^megalive-portal(?:-\d+)?$/.test(p.name) && p.pm2_env.status === 'online');
const portOf = p => Number(p.pm2_env.env?.PORT || p.pm2_env.PORT || 3000);
const oldPorts = current.map(portOf);
const available = [3000,3001,3002,3003].filter(p => !oldPorts.includes(p)).slice(0,count);
if (available.length !== count) throw Error('No spare ports for rolling deployment.');
const base = JSON.parse(readFileSync(path.join(release,'release.ecosystem.json'),'utf8')).apps[0];
const previousUpstream = readFileSync(upstream,'utf8');
const snapshot = current.map(p => ({name:p.name,script:p.pm2_env.pm_exec_path,cwd:p.pm2_env.pm_cwd,
  interpreter:p.pm2_env.exec_interpreter,env:p.pm2_env.env,exec_mode:'fork',instances:1,kill_timeout:60000,watch:false}));
const rollbackFile = path.join(release,`rollback-${Date.now()}.json`);
writeFileSync(rollbackFile,JSON.stringify({apps:snapshot}),{mode:0o600});
writeFileSync(rollbackFile+'.nginx',previousUpstream,{mode:0o600});
function configure(ports) {
  if (!ports.length) throw Error('Refusing an empty upstream.');
  const config = `upstream megalive_backend {\n  ip_hash;\n${ports.map(port=>`  server 127.0.0.1:${port} max_fails=2 fail_timeout=5s;`).join('\n')}\n  keepalive 64;\n}\n`;
  writeFileSync(upstream+'.new',config,{mode:0o644}); renameSync(upstream+'.new',upstream);
  run('nginx',['-t']);run('nginx',['-s','reload']);
}
async function ready(port) {
  for (let i=0;i<45;i++) {
    try {
      const response=await fetch(`http://127.0.0.1:${port}/internal/ready`,{signal:AbortSignal.timeout(3000)});
      if(response.ok && (await response.json()).ready) return;
    } catch {}
    await delay(1000);
  }
  throw Error(`Readiness failed on port ${port}`);
}
const started=[];
try {
  // Hashed assets remain available across old/new HTML during the transition.
  mkdirSync('/var/lib/megalive/next-static',{recursive:true});
  run('cp',['-a',path.join(release,'.next/static')+'/.','/var/lib/megalive/next-static/']);
  for(const processInfo of current) {
    const source=path.join(processInfo.pm2_env.pm_cwd,'.next/static')+'/.';
    if(existsSync(source))run('cp',['-an',source,'/var/lib/megalive/next-static/']);
  }
  run('chmod',['-R','a+rX','/var/lib/megalive/next-static']);
  // Refuse to switch traffic if assets were nested or omitted by the copy.
  function verifyAssets(source, destination) {
    for (const entry of readdirSync(source, { withFileTypes: true })) {
      const from = path.join(source, entry.name), to = path.join(destination, entry.name);
      if (entry.isDirectory()) verifyAssets(from, to);
      else if (!existsSync(to) || !readFileSync(from).equals(readFileSync(to))) {
        throw Error(`Missing or mismatched published asset: ${entry.name}`);
      }
    }
  }
  verifyAssets(path.join(release, '.next/static'), '/var/lib/megalive/next-static');
  for(const port of available) {
    const name=`megalive-portal-${port}`;
    if(list().some(p=>p.name===name))run('pm2',['delete',name]);
    const config={apps:[{...base,name,cwd:release,pm_cwd:release,script:path.join(release,'server.js'),pm_exec_path:path.join(release,'server.js'),
      instances:1,exec_mode:'fork',watch:false,kill_timeout:60000,restart_delay:1000,
      out_file:`/root/.pm2/logs/${name}-out.log`,error_file:`/root/.pm2/logs/${name}-error.log`,
      env:{...base.env,PORT:String(port),HOSTNAME:'127.0.0.1',PORTAL_METRICS:'true'}}]};
    const file=path.join(release,`${name}.json`);writeFileSync(file,JSON.stringify(config),{mode:0o600});
    run('pm2',['start',file]);started.push(name);await ready(port);
  }
  const serving=[...oldPorts];
  for(let i=0;i<available.length;i++) {
    serving[i]=available[i];configure(serving);await delay(1500);
    if(current[i])run('pm2',['stop',current[i].name]);
  }
  configure(available);
  for(const old of current.slice(count))run('pm2',['stop',old.name]);
  for(const port of available)await ready(port);
  run('pm2',['save']);
  writeFileSync(path.join(release,'activation.json'),JSON.stringify({at:new Date().toISOString(),release,processes:count,ports:available,rollbackFile},null,2));
  console.log(JSON.stringify({release,processes:count,ports:available,rollbackFile}));
} catch(error) {
  // Restore old workers before routing requests back to them.
  if(snapshot.length)run('pm2',['start',rollbackFile]);
  writeFileSync(upstream,previousUpstream,{mode:0o644});run('nginx',['-t']);run('nginx',['-s','reload']);
  for(const name of started)try{run('pm2',['stop',name]);}catch{}
  run('pm2',['save']);
  throw error;
}
