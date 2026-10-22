// READ ONLY. No deletion or changes to application records.
import dotenv from 'dotenv';
import pg from 'pg';
import {createHash} from 'node:crypto';
dotenv.config({path:'.env.local',quiet:true});
const client=new pg.Client({connectionString:process.env.DATABASE_URL});
try {
 await client.connect();await client.query('BEGIN READ ONLY');
 const database=await client.query('SELECT current_database() AS db, inet_server_addr()::text AS host, inet_server_port() AS port');
 console.log(JSON.stringify({databaseFingerprint:createHash('sha256').update(JSON.stringify(database.rows)).digest('hex')}));
 const users=await client.query(`SELECT id,"publicId",email,status,"deletedAt" FROM "User" WHERE lower(email)=ANY($1::text[]) OR "publicId"=ANY($2::text[])`,[['farhadawan002@gmail.com','thecallmexbilal@gmail.com'],['TLN-262531','USR-262531','USR-159909','TLN-159909']]);
 console.log(JSON.stringify({users:users.rows}));
 if(users.rows.length){
  const ids=users.rows.map(u=>u.id);
  const gifts=await client.query(`SELECT count(*)::text AS count FROM "GiftTransaction" WHERE ("senderId"=ANY($1::text[]) OR "recipientUserId"=ANY($1::text[])) AND ("senderId"<>ALL($1::text[]) OR ("recipientUserId" IS NOT NULL AND "recipientUserId"<>ALL($1::text[])))`,[ids]);
  console.log(JSON.stringify({sharedGiftTransactions:gifts.rows[0].count}));
 }
 await client.query('ROLLBACK');
}finally{await client.end();}
