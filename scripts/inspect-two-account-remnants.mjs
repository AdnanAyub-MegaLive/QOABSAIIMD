import dotenv from 'dotenv';
import pg from 'pg';
dotenv.config({path:'.env.local',quiet:true});
const c=new pg.Client({connectionString:process.env.DATABASE_URL});
const identifiers=['cmv7p6jgp0023xvtzfsu8by48','cmv7ps9ob006pxvtzhh13v8km','TLN-262531','USR-262531','USR-159909','TLN-159909','farhadawan002@gmail.com','thecallmexbilal@gmail.com'];
const quote=s=>'"'+s.replaceAll('"','""')+'"';
try {
 await c.connect();await c.query('BEGIN READ ONLY');
 await c.query("SET LOCAL statement_timeout = '30s'");
 const tables=await c.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations' ORDER BY tablename`);
 for(const {tablename} of tables.rows){
  const rows=await c.query(`SELECT count(*)::int AS count FROM public.${quote(tablename)} t WHERE EXISTS (SELECT 1 FROM unnest($1::text[]) i WHERE strpos(lower(to_jsonb(t)::text),lower(i))>0)`,[identifiers]);
  if(rows.rows[0].count)console.log(JSON.stringify({table:tablename,count:rows.rows[0].count}));
 }
 const fk=await c.query(`SELECT conrelid::regclass::text AS child,confrelid::regclass::text AS parent,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE contype='f' AND connamespace='public'::regnamespace`);
 console.log(JSON.stringify({foreignKeys:fk.rows.filter(r=>/User|Device|Assignment|Session|Talent/.test(r.parent))}));
 await c.query('ROLLBACK');
}finally{await c.end();}
