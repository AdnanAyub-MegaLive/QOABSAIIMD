// Session-local TEMP tables only. No public table is read or modified.
import dotenv from 'dotenv';
import pg from 'pg';
import assert from 'node:assert/strict';
dotenv.config({path:'.env.local',quiet:true});
const client=new pg.Client({connectionString:process.env.DATABASE_URL});
try {
 await client.connect();await client.query('BEGIN');
 await client.query('CREATE TEMP TABLE qa_delete_parent (id integer PRIMARY KEY, child integer) ON COMMIT DROP');
 await client.query('CREATE TEMP TABLE qa_delete_child (id integer PRIMARY KEY, parent integer REFERENCES qa_delete_parent(id) ON DELETE RESTRICT) ON COMMIT DROP');
 await client.query('ALTER TABLE qa_delete_parent ADD FOREIGN KEY(child) REFERENCES qa_delete_child(id) ON DELETE RESTRICT');
 await client.query('INSERT INTO qa_delete_parent VALUES(1,NULL)');
 await client.query('INSERT INTO qa_delete_child VALUES(2,1)');
 await client.query('UPDATE qa_delete_parent SET child=2');
 const result=await client.query('WITH a AS (DELETE FROM qa_delete_parent RETURNING 1), b AS (DELETE FROM qa_delete_child RETURNING 1) SELECT (SELECT count(*) FROM a)+(SELECT count(*) FROM b) AS deleted');
 assert.equal(result.rows[0].deleted,'2');
 console.log('PASS: cyclic RESTRICT dependencies delete in one statement; temporary fixtures rolled back.');
} finally {await client.query('ROLLBACK').catch(()=>{});await client.end();}
