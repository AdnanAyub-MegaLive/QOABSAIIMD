import { PGlite } from '@electric-sql/pglite';
import { it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('./prisma', () => ({ prisma: { $queryRaw: mocks.query } }));
vi.mock('./portal-admin', () => ({ portalPermissionError: async () => null }));
import { GET } from '../app/api/admin/room-management/moderation/route';

it('returns portal and mobile ban actors and matches the correct moderation log', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE "AudioRoom"(id text, "roomId" text, title text);
      CREATE TABLE "User"(id text, "publicId" text, name text);
      CREATE TABLE "AudioRoomBan"(id text,"publicId" text,"audioRoomId" text,"userId" text,"actorId" text,"adminActorId" text,"adminActorName" text,reason text,"createdAt" timestamp,"expiresAt" timestamp,"revokedAt" timestamp);
      CREATE TABLE "AudioRoomModerationLog"(id text,action text,"audioRoomId" text,"targetId" text,"actorId" text,"adminActorId" text,"adminActorName" text,reason text,"createdAt" timestamp,"expiresAt" timestamp,"durationMinutes" integer);
      INSERT INTO "AudioRoom" VALUES ('r','ROOM-QA','QA');
      INSERT INTO "User" VALUES ('u','USR-QA','Target'),('owner','USR-OWNER','Room owner');
      INSERT INTO "AudioRoomBan" VALUES ('b1','BAN-1','r','u',NULL,'admin','Platform Admin','test',now(),NULL,NULL),('b2','BAN-2','r','u','owner',NULL,NULL,'test',now(),NULL,NULL);
      INSERT INTO "AudioRoomModerationLog" VALUES ('wrong','ROOM_BANNED','r','u',NULL,'other','Other admin','test',now(),NULL,0),('correct','ROOM_BANNED','r','u',NULL,'admin','Platform Admin','test',now(),NULL,0);
    `);
    mocks.query.mockImplementation(async sql => (await db.query(sql.text, sql.values)).rows);
    const response = await GET(new Request('https://portal.test/?type=BAN'));
    expect(response.status).toBe(200);
    const { items } = (await response.json()).data;
    expect(items.find(row => row.banId === 'BAN-1')).toMatchObject({ id: 'correct', actor: { name: 'Platform Admin', adminId: 'admin', publicId: null } });
    expect(items.find(row => row.banId === 'BAN-2')).toMatchObject({ actor: { name: 'Room owner', publicId: 'USR-OWNER', adminId: null } });
  } finally { await db.close(); }
}, 15000);
