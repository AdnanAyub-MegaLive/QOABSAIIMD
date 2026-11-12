import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("combines media, room text and system history and safely cleans chat notifications", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE "User" (id text, "publicId" text, name text);
      CREATE TABLE "Conversation" (id text, "publicId" text, kind text, name text);
      CREATE TABLE "Message" ("publicId" text, "conversationId" text, "senderId" text, body text, kind text, "voiceKey" text, "voiceDurationMs" integer, "voiceMimeType" text, "mediaId" text, media jsonb, gift jsonb, "deletedAt" timestamp, "deletedById" text, "createdAt" timestamp);
      CREATE TABLE "AudioRoomMessage" ("publicId" text, body text, "createdAt" timestamp, "senderPublicId" text, "senderName" text, "roomPublicId" text, "roomTitle" text);
      CREATE TABLE "Notification" (id text PRIMARY KEY, "publicId" text, title text, body text, "createdAt" timestamp, "userId" text, type text);
      CREATE TABLE "NotificationRead" ("notificationId" text REFERENCES "Notification"(id) ON DELETE CASCADE);
      INSERT INTO "User" VALUES ('user','USR-1','Alice');
      INSERT INTO "Conversation" VALUES ('chat','CONV-1','DIRECT',NULL);
      INSERT INTO "Message" ("publicId","conversationId","senderId",body,kind,"voiceKey","voiceDurationMs","deletedAt","deletedById") VALUES ('MSG-1','chat','user','Voice message','voice','private-key',1400,now(),'user');
      INSERT INTO "AudioRoomMessage" ("publicId",body) VALUES ('ROOM-1','hello');
      INSERT INTO "Notification" VALUES ('chat','NTF-1','Photo','Photo',now(),'user','CHAT_MESSAGE'),('real','NTF-2','Notice','Announcement',now(),'user','OFFICIAL');
      INSERT INTO "NotificationRead" VALUES ('chat'),('real');
    `);
    const source = readFileSync('src/app/messages/page.js', 'utf8');
    const query = source.match(/const combinedSql = Prisma.sql`([\s\S]*?)`;/)[1];
    const result = await db.query(`SELECT * FROM (${query}) combined WHERE COALESCE(kind,'text') = 'voice'`);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ kind: 'voice', voiceDurationMs: 1400, deletedBy: 'sender' });
    expect((await db.query(`SELECT * FROM (${query}) combined WHERE COALESCE(kind,'text') = 'text'`)).rows).toHaveLength(3);
    const migration = readFileSync('prisma/migrations/20261112090000_remove_chat_message_notifications/migration.sql', 'utf8');
    await db.exec(migration); await db.exec(migration);
    expect((await db.query('SELECT type FROM "Notification"')).rows).toEqual([{ type: 'OFFICIAL' }]);
    expect((await db.query('SELECT * FROM "NotificationRead"')).rows).toEqual([{ notificationId: 'real' }]);
  } finally { await db.close(); }
}, 30000);
