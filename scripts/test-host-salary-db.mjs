// Run against a disposable database on the local development PostgreSQL server.
import {execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {config} from 'dotenv';
import pg from 'pg';

config({path:'.env.local',quiet:true});
const url=new URL(process.env.DATABASE_URL);
if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw new Error('Local PostgreSQL required');
const name=`salary_qa_${process.pid}`;
const admin=new pg.Client({connectionString:url.href});
await admin.connect();
const temp=mkdtempSync(join(tmpdir(),'salary-qa-'));
let created=false;
try {
  await admin.query('CREATE DATABASE '+name);
  created=true;
  url.pathname='/'+name;
  const env={...process.env,DATABASE_URL:url.href,HOST_SALARY_QA:'1'};
  const baseline=readFileSync('prisma/schema.prisma','utf8')
    .replace(/^model HostSalary(?:Schedule|Control|Award) \{[^}]*\}\n/gm,'')
    .replace(/^  HOST_SALARY_REWARD\n/m,'');
  const schema=join(temp,'schema.prisma');
  writeFileSync(schema,baseline);
  execFileSync('npx',['prisma','db','push','--schema',schema],{env,stdio:'pipe'});
  const local=new pg.Client({connectionString:url.href});
  await local.connect();
  try {
    await local.query(readFileSync('prisma/migrations/20261106190000_host_salary/migration.sql','utf8'));
  } finally { await local.end(); }
  execFileSync('npx',['vitest','run','src/lib/host-salary-db.test.js'],{env,stdio:'inherit'});
} finally {
  if(created)await admin.query('DROP DATABASE '+name+' WITH (FORCE)');
  await admin.end();
  rmSync(temp,{recursive:true,force:true});
}
