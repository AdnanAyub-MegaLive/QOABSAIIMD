import {createHash, createHmac, timingSafeEqual} from 'node:crypto';
import {isDatabaseOwner} from './database-management-access.js';

const protectedTables = new Set(['Admin', '_prisma_migrations']);
const quote = name => '"' + name.replaceAll('"','""') + '"';
const table = name => `"public".${quote(name)}`;
const fail = (message,code='VALIDATION_ERROR',status=422) => Object.assign(new Error(message),{code,status});
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sign = value => {
  if (!process.env.AUTH_SECRET) throw fail('Confirmation signing is not configured.','UNAVAILABLE',503);
  return createHmac('sha256',process.env.AUTH_SECRET).update(value).digest('base64url');
};
export function sealDatabasePreview(payload) {
  const value=Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${value}.${sign(value)}`;
}
export function openDatabasePreview(token,adminId,now=Date.now()) {
  if(typeof token!=='string'||token.length>10000)throw fail('Invalid preview.');
  const [value,signature,...rest]=token.split('.');
  const expected=Buffer.from(sign(value??'')),given=Buffer.from(signature??'');
  if(rest.length||expected.length!==given.length||!timingSafeEqual(expected,given))throw fail('Invalid preview.');
  let payload;try{payload=JSON.parse(Buffer.from(value,'base64url').toString());}catch{throw fail('Invalid preview.');}
  if(payload.adminId!==adminId||payload.expiresAt<now)throw fail('Preview expired. Generate a new preview.','PREVIEW_EXPIRED',409);
  return payload;
}
export async function databaseTables(db) {
  const rows=await db.$queryRawUnsafe(`SELECT tablename AS name FROM pg_tables WHERE schemaname='public' ORDER BY tablename`);
  return rows.map(row=>row.name).filter(name=>!protectedTables.has(name));
}
function selection(input,names) {
  if(input?.mode==='RESET')return {mode:'RESET'};
  if(!['ROW','TABLE'].includes(input?.mode)||!names.includes(input.table))throw fail('Choose a supported table and deletion mode.');
  const id=typeof input.id==='string'?input.id.trim():'';
  if(input.mode==='ROW'&&(!id||id.length>200))throw fail('Provide the exact record ID or public ID.');
  return {mode:input.mode,table:input.table,...(input.mode==='ROW'?{id}:{})};
}
// PostgreSQL catalogues, rather than a manually maintained list, provide the
// real FK graph. All identifiers below come from these catalogues, never SQL input.
export async function databaseDeletionPlan(tx,input) {
  const names=await databaseTables(tx),scope=selection(input,names);
  const relations=await tx.$queryRawUnsafe(`SELECT child.relname AS child, parent.relname AS parent,
    array_agg(ca.attname ORDER BY k.ord) AS "childColumns",
    array_agg(pa.attname ORDER BY k.ord) AS "parentColumns"
    FROM pg_constraint fk JOIN pg_class child ON child.oid=fk.conrelid
    JOIN pg_namespace cn ON cn.oid=child.relnamespace
    JOIN pg_class parent ON parent.oid=fk.confrelid
    JOIN pg_namespace pn ON pn.oid=parent.relnamespace
    CROSS JOIN LATERAL unnest(fk.conkey,fk.confkey) WITH ORDINALITY k(c,p,ord)
    JOIN pg_attribute ca ON ca.attrelid=child.oid AND ca.attnum=k.c
    JOIN pg_attribute pa ON pa.attrelid=parent.oid AND pa.attnum=k.p
    WHERE fk.contype='f' AND cn.nspname='public' AND pn.nspname='public'
    GROUP BY fk.oid,child.relname,parent.relname`);
  const selected=new Map(),versions=new Map();let total=0;
  const add=(name,rows)=>{
    if(rows.length&&protectedTables.has(name))throw fail('This operation would remove protected administrator records.','PROTECTED_RECORD',409);
    const ids=selected.get(name)??new Set();let changed=false;
    for(const row of rows)if(!ids.has(row.locator)){ids.add(row.locator);versions.set(`${name}:${row.locator}`,row.version);total++;changed=true;}
    if(total>100000)throw fail('This selection exceeds the interactive deletion limit of 100,000 rows. Use a smaller selection.','SELECTION_TOO_LARGE',409);
    if(ids.size)selected.set(name,ids);return changed;
  };
  for(const name of scope.mode==='RESET'?names:[scope.table]) {
    let condition='',args=[];
    if(scope.mode==='ROW'){
      const columns=await tx.$queryRawUnsafe(`SELECT column_name AS name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name IN ('id','publicId')`,name);
      if(!columns.length)throw fail('This table has no single ID. Use table deletion.');
      condition=' WHERE '+columns.map(c=>`${quote(c.name)}::text=$1`).join(' OR ');args=[scope.id];
    }
    add(name,await tx.$queryRawUnsafe(`SELECT ctid::text AS locator, xmin::text AS version FROM ${table(name)}${condition} LIMIT 100001`,...args));
  }
  if(scope.mode==='ROW'&&total!==1)throw fail('Expected exactly one matching record.','NOT_FOUND',404);
  let changed=true;
  while(changed){
    changed=false;
    for(const relation of relations){
      const parents=selected.get(relation.parent);if(!parents?.size)continue;
      const join=relation.childColumns.map((col,i)=>`c.${quote(col)}=p.${quote(relation.parentColumns[i])}`).join(' AND ');
      const rows=await tx.$queryRawUnsafe(`SELECT DISTINCT c.ctid::text AS locator, c.xmin::text AS version FROM ${table(relation.child)} c JOIN ${table(relation.parent)} p ON ${join} WHERE p.ctid::text=ANY($1::text[]) LIMIT 100001`,[...parents]);
      if(add(relation.child,rows))changed=true;
    }
  }
  const entries=[...selected].sort(([a],[b])=>a.localeCompare(b)).map(([name,ids])=>[name,[...ids].sort()]);
  return {scope,entries,total,counts:entries.map(([name,ids])=>({table:name,count:ids.length})),fingerprint:hash([entries,[...versions].sort(([a],[b])=>a.localeCompare(b))])};
}
export async function executeDatabaseDeletion(db,payload) {
  let removedUserIds=[];
  const result=await db.$transaction(async tx=>{
    await tx.$queryRawUnsafe('SELECT id FROM "public"."Admin" WHERE id=$1 FOR SHARE',payload.adminId);
    const admin=await tx.admin.findUnique({where:{id:payload.adminId}});
    if(!isDatabaseOwner(admin)||admin.sessionVersion!==payload.sessionVersion)throw fail('Administrator session changed.','FORBIDDEN',403);
    // Freeze all application tables before recomputing the preview. Concurrent
    // writers cannot add unreviewed dependent rows between validation and DELETE.
    const names=await databaseTables(tx);
    if(names.length)await tx.$executeRawUnsafe(`LOCK TABLE ${names.map(table).join(',')} IN SHARE ROW EXCLUSIVE MODE`);
    const plan=await databaseDeletionPlan(tx,payload.scope);
    if(plan.fingerprint!==payload.fingerprint)throw fail('Data changed after preview. Nothing deleted; preview again.','PREVIEW_STALE',409);
    if(!plan.entries.length)return {deleted:0};
    const unsafe=await tx.$queryRawUnsafe(`SELECT 1 FROM pg_constraint fk JOIN pg_class p ON p.oid=fk.confrelid JOIN pg_namespace pn ON pn.oid=p.relnamespace JOIN pg_class c ON c.oid=fk.conrelid JOIN pg_namespace cn ON cn.oid=c.relnamespace WHERE fk.contype='f' AND pn.nspname='public' AND p.relname=ANY($1::text[]) AND cn.nspname<>'public'
      UNION ALL SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname='public' AND c.relname=ANY($1::text[]) LIMIT 1`,plan.entries.map(([name])=>name));
    if(unsafe.length)throw fail('Custom triggers or cross-schema dependencies require a database-specific deletion plan.','UNSUPPORTED_DEPENDENCY',409);
    const userRows=plan.entries.find(([name])=>name==='User');
    if(userRows)removedUserIds=(await tx.$queryRawUnsafe('SELECT "publicId" FROM "public"."User" WHERE ctid::text=ANY($1::text[])',userRows[1])).map(row=>row.publicId);
    // One statement lets FK checks observe the completed set, including cycles.
    // No cascade override, trigger disabling, audit copies or financial adjustments.
    const sql=plan.entries.map(([name],i)=>`d${i} AS (DELETE FROM ${table(name)} WHERE ctid::text=ANY($${i+1}::text[]) RETURNING 1)`);
    await tx.$queryRawUnsafe(`WITH ${sql.join(',')} SELECT ${plan.entries.map((_,i)=>`(SELECT count(*) FROM d${i})`).join('+')} AS deleted`,...plan.entries.map(([,ids])=>ids));
    return {deleted:plan.total};
  },{timeout:60000,maxWait:5000});
  // Existing sockets must not continue as deleted accounts. Best-effort only:
  // post-commit delivery failures cannot turn successful deletion into a retry.
  try{for(const publicId of removedUserIds)globalThis.portalIo?.in(`user:${publicId}`).disconnectSockets(true);}catch{}
  return result;
}
