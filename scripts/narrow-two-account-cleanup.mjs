import dotenv from 'dotenv';
import pg from 'pg';
dotenv.config({path:'.env.local',quiet:true});
const c=new pg.Client({connectionString:process.env.DATABASE_URL});
const ids=['cmv7p6jgp0023xvtzfsu8by48','cmv7ps9ob006pxvtzhh13v8km'];
const apply=process.argv.includes('--apply');
try{
 await c.connect();await c.query('BEGIN');
 await c.query("SET LOCAL lock_timeout='5s'");
 const users=await c.query('SELECT id,"publicId","deletedAt" FROM "User" WHERE id=ANY($1::text[]) FOR UPDATE',[ids]);
 if(users.rowCount!==2||users.rows.some(r=>!r.deletedAt)||users.rows.some(r=>!['TLN-262531','USR-159909'].includes(r.publicId)))throw Error('Target identity/deleted-state guard failed');
 const targets=['UploadAssetAssignment','GamePlayerSession','TaskTimerCursor','Device'];
 const fk=await c.query(`SELECT conrelid::regclass::text AS child,confrelid::regclass::text AS parent FROM pg_constraint WHERE contype='f' AND confrelid=ANY($1::regclass[])`,[targets.map(t=>'"'+t+'"')]);
 if(fk.rows.some(r=>r.parent!=='"Device"'||r.child!=='"Ban"'))throw Error('Unexpected dependent table; manual review required');
 const triggers=await c.query(`SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgrelid=ANY($1::regclass[])`,[targets.map(t=>'"'+t+'"')]);
 if(triggers.rowCount)throw Error('Custom trigger requires review');
 const giftQuery=`SELECT count(*)::int AS count,md5(string_agg(to_jsonb(t)::text,'' ORDER BY id)) AS digest FROM "GiftTransaction" t WHERE ("senderId"=ANY($1::text[]) OR "recipientUserId"=ANY($1::text[])) AND ("senderId"<>ALL($1::text[]) OR ("recipientUserId" IS NOT NULL AND "recipientUserId"<>ALL($1::text[])))`;
 const before=(await c.query(giftQuery,[ids])).rows[0];
 if(before.count!==294)throw Error('Shared gift baseline changed; review required');
 const result={mode:apply?'apply':'preview',preservedSharedGifts:before.count,rows:{}};
 for(const table of targets){
  const where=table==='Device'?`"userId"=ANY($1::text[]) AND "talentId" IS NULL AND NOT EXISTS(SELECT 1 FROM "Ban" b WHERE b."deviceId"=t.id)`:`"userId"=ANY($1::text[])`;
  const rows=await c.query(`SELECT * FROM "${table}" t WHERE ${where} FOR UPDATE`,[ids]);
  result.rows[table]=rows.rowCount;
  if(apply)await c.query(`DELETE FROM "${table}" t WHERE ${where}`,[ids]);
 }
 const after=(await c.query(giftQuery,[ids])).rows[0];
 if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Shared history changed; rolling back');
 await c.query(apply?'COMMIT':'ROLLBACK');console.log(JSON.stringify(result));
}catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{await c.end();}
