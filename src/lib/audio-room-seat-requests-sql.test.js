import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { it,expect } from 'vitest';
it('isolated database enforces one pending request and rolls back seat admission with resolution',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`CREATE TABLE "AudioRoom"(id TEXT PRIMARY KEY); CREATE TABLE "User"(id TEXT PRIMARY KEY);
      INSERT INTO "AudioRoom" VALUES ('r'); INSERT INTO "User" VALUES ('u');
      CREATE TABLE seats(id TEXT PRIMARY KEY, occupant TEXT, locked BOOLEAN);
      INSERT INTO seats VALUES ('s',NULL,true);`);
    await db.exec(readFileSync(new URL('../../prisma/migrations/20261029120000_audio_room_seat_requests/migration.sql',import.meta.url),'utf8'));
    await db.exec(`INSERT INTO "AudioRoomSeatRequest" (id,"audioRoomId","requesterId","expiresAt") VALUES ('req','r','u',CURRENT_TIMESTAMP+interval '1 minute')`);
    await expect(db.exec(`INSERT INTO "AudioRoomSeatRequest" (id,"audioRoomId","requesterId","expiresAt") VALUES ('duplicate','r','u',CURRENT_TIMESTAMP+interval '1 minute')`)).rejects.toThrow();
    await expect(db.transaction(async tx=>{await tx.exec(`UPDATE seats SET occupant='u' WHERE id='s';UPDATE "AudioRoomSeatRequest" SET status='APPROVED' WHERE id='req';`);throw new Error('rollback');})).rejects.toThrow('rollback');
    expect((await db.query(`SELECT occupant,locked FROM seats`)).rows).toEqual([{occupant:null,locked:true}]);
    expect((await db.query(`SELECT status FROM "AudioRoomSeatRequest"`)).rows[0].status).toBe('PENDING');
    const claim=()=>db.transaction(async tx=>{
      const result=await tx.query(`UPDATE "AudioRoomSeatRequest" SET status='APPROVED' WHERE id='req' AND status='PENDING' RETURNING id`);
      if(result.rows.length)await tx.exec(`UPDATE seats SET occupant='u' WHERE id='s' AND occupant IS NULL`);
      return result.rows.length;
    });
    expect(await Promise.all([claim(),claim()])).toEqual([1,0]);
    expect((await db.query(`SELECT occupant,locked FROM seats`)).rows).toEqual([{occupant:'u',locked:true}]);
  }finally{await db.close();}
});
