import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { sessionAttendance } from "./agency-salary.js";

it("records seat lifecycle atomically, deduplicates retries, and bounds disconnect/crash gaps", async () => {
  const db=new PGlite();
  try {
    await db.exec(`CREATE TABLE "User"(id TEXT PRIMARY KEY);
      CREATE TABLE "AudioRoom"(id TEXT PRIMARY KEY,status TEXT);
      CREATE TABLE "AudioRoomMember"("audioRoomId" TEXT,"userId" TEXT,"socketCount" INT);
      CREATE TABLE "AudioRoomSeat"(id TEXT PRIMARY KEY,"audioRoomId" TEXT,"occupantUserId" TEXT,"occupiedAt" TIMESTAMP(3),"isMuted" BOOLEAN);
      INSERT INTO "User" VALUES ('host'),('listener'); INSERT INTO "AudioRoom" VALUES ('room','LIVE');
      INSERT INTO "AudioRoomMember" VALUES ('room','host',1),('room','listener',1);
      INSERT INTO "AudioRoomSeat" VALUES ('existing','room','host',CURRENT_TIMESTAMP-interval '30 minutes',true);`);
    await db.exec(readFileSync(new URL('../../prisma/migrations/20261030210000_audio_mic_attendance/migration.sql',import.meta.url),'utf8'));
    const rows=async()=> (await db.query('SELECT * FROM "AudioRoomMicSession" ORDER BY "startedAt"')).rows;
    let sessions=await rows();expect(sessions).toHaveLength(1);
    const now=new Date();expect(sessionAttendance(sessions,new Date(+now-86400000),new Date(+now+86400000),now).liveMinutes).toBe(30);
    await db.exec(`UPDATE "AudioRoomSeat" SET "occupantUserId"='host',"isMuted"=false WHERE id='existing'`);
    expect(await rows()).toHaveLength(1); // same-seat retry / unmute is not a new session
    await expect(db.transaction(async tx=>{await tx.exec(`UPDATE "AudioRoomSeat" SET "occupantUserId"=NULL WHERE id='existing'`);throw Error('rollback');})).rejects.toThrow('rollback');
    expect((await rows())[0].endedAt).toBeNull();
    await db.exec(`UPDATE "AudioRoomSeat" SET "occupantUserId"=NULL,"occupiedAt"=NULL WHERE id='existing'`);
    expect((await rows())[0].endedAt).not.toBeNull();
    await db.exec(`INSERT INTO "AudioRoomSeat" VALUES ('next','room','host',CURRENT_TIMESTAMP,true)`);
    expect(await rows()).toHaveLength(2);
    await db.exec(`SELECT refresh_audio_mic_attendance('room',ARRAY['host'],CURRENT_TIMESTAMP::timestamp)`);
    expect(await rows()).toHaveLength(2); // spectator never accrues mic time
    expect((await rows()).every(s=>s.userId==='host')).toBe(true);
    await db.exec(`UPDATE "AudioRoomMicSession" SET "startedAt"=CURRENT_TIMESTAMP-interval '2 hours',"lastSeenAt"=CURRENT_TIMESTAMP-interval '1 hour' WHERE "endedAt" IS NULL;
      SELECT refresh_audio_mic_attendance('room',ARRAY['host'],CURRENT_TIMESTAMP::timestamp)`);
    sessions=await rows();expect(sessions).toHaveLength(3);
    const stale=sessions.find(s=>s.endedAt && +new Date(s.endedAt)-+new Date(s.lastSeenAt)>40000);
    expect(+new Date(stale.endedAt)-+new Date(stale.lastSeenAt)).toBe(45000);
    expect(sessions.filter(s=>s.endedAt===null)).toHaveLength(1); // reconnect starts a new interval
    await db.exec(`SELECT refresh_audio_mic_attendance('room',ARRAY[]::text[],CURRENT_TIMESTAMP::timestamp)`);
    expect((await rows()).every(s=>s.endedAt!==null)).toBe(true);
    await db.exec(`SELECT refresh_audio_mic_attendance('room',ARRAY['host'],CURRENT_TIMESTAMP::timestamp);
      DELETE FROM "AudioRoomSeat" WHERE id='next';`);
    expect((await rows()).every(s=>s.endedAt!==null)).toBe(true); // layout deletion also closes attendance
  } finally { await db.close(); }
},15000);
