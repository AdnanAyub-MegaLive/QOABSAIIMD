import { PGlite } from '@electric-sql/pglite';
import { expect, it, vi } from 'vitest';
import { roomCardActivity, roomCardActivityDto } from './room-card-activity.js';

it('reads 50 room cards in one query with exact totals and only currently claimable envelopes', async () => {
  const pg = new PGlite();
  const db = { $queryRaw: vi.fn(async query => (await pg.query(query.text, query.values)).rows) };
  try {
    await pg.exec(`
      CREATE TABLE "AudioRoom" (id TEXT PRIMARY KEY, "roomId" TEXT UNIQUE);
      CREATE TABLE "RoomGiftTotal" ("roomId" TEXT PRIMARY KEY, coins BIGINT);
      CREATE TABLE "RoomGiftDelta" (id TEXT PRIMARY KEY, "roomId" TEXT, coins BIGINT, "processedAt" TIMESTAMP);
      CREATE TABLE "RedEnvelope" (id TEXT PRIMARY KEY, "audioRoomId" TEXT, status TEXT,
        "claimableAt" TIMESTAMP, "expiresAt" TIMESTAMP, "remainingShares" INTEGER, "remainingCoins" BIGINT);
      INSERT INTO "AudioRoom" SELECT 'internal-' || n, 'ROOM-' || n FROM generate_series(1, 51) n;
      INSERT INTO "RoomGiftTotal" VALUES ('ROOM-1', 9007199254740993);
      INSERT INTO "RoomGiftDelta" VALUES
        ('new', 'ROOM-1', 100, NULL), ('reversal', 'ROOM-1', -20, NULL),
        ('folded', 'ROOM-1', 500, CURRENT_TIMESTAMP), ('other', 'ROOM-51', 900, NULL);
      INSERT INTO "RedEnvelope" VALUES
        ('open', 'internal-1', 'ACTIVE', CURRENT_TIMESTAMP - interval '1 minute', CURRENT_TIMESTAMP + interval '1 hour', 2, 10),
        ('expired', 'internal-1', 'ACTIVE', CURRENT_TIMESTAMP - interval '2 hours', CURRENT_TIMESTAMP - interval '1 hour', 2, 10),
        ('delayed', 'internal-1', 'ACTIVE', CURRENT_TIMESTAMP + interval '1 hour', CURRENT_TIMESTAMP + interval '2 hours', 2, 10),
        ('depleted', 'internal-1', 'DEPLETED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + interval '1 hour', 2, 10),
        ('no-shares', 'internal-1', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + interval '1 hour', 0, 10),
        ('no-coins', 'internal-1', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + interval '1 hour', 2, 0),
        ('other-room', 'internal-51', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + interval '1 hour', 2, 10);
    `);
    const ids = Array.from({ length: 50 }, (_, i) => `ROOM-${i + 1}`);
    const result = await roomCardActivity(db, [...ids, ids[0]]);
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    expect(result.size).toBe(50);
    expect(result.get('ROOM-1')).toEqual({ giftTotalCoins: '9007199254741073', activeRedEnvelopeCount: 1 });
    expect(result.get('ROOM-2')).toEqual({ giftTotalCoins: '0', activeRedEnvelopeCount: 0 });
    expect(result.has('ROOM-51')).toBe(false);

    // Folding committed deltas must leave the card value unchanged.
    await pg.exec(`BEGIN;
      UPDATE "RoomGiftTotal" SET coins = coins + 80 WHERE "roomId" = 'ROOM-1';
      UPDATE "RoomGiftDelta" SET "processedAt" = CURRENT_TIMESTAMP WHERE id IN ('new', 'reversal');
      COMMIT;`);
    expect((await roomCardActivity(db, ids)).get('ROOM-1')).toEqual(result.get('ROOM-1'));
    await pg.exec(`UPDATE "RedEnvelope" SET "remainingShares" = 0 WHERE id = 'open'`);
    expect((await roomCardActivity(db, ids)).get('ROOM-1').activeRedEnvelopeCount).toBe(0);
    await pg.exec(`UPDATE "RedEnvelope" SET "remainingShares" = 2, "expiresAt" = CURRENT_TIMESTAMP WHERE id = 'open'`);
    expect((await roomCardActivity(db, ids)).get('ROOM-1').activeRedEnvelopeCount).toBe(0);

    // Opening time is inclusive, expiry exclusive, using database time.
    await pg.exec(`UPDATE "RedEnvelope" SET "claimableAt" = CURRENT_TIMESTAMP, "expiresAt" = CURRENT_TIMESTAMP + interval '1 hour' WHERE id = 'open'`);
    expect((await roomCardActivity(db, ids)).get('ROOM-1').activeRedEnvelopeCount).toBe(1);
  } finally { await pg.close(); }
});

it('skips empty lists and provides zero values for a room removed after listing', async () => {
  const db = { $queryRaw: vi.fn() };
  const result = await roomCardActivity(db, []);
  expect(db.$queryRaw).not.toHaveBeenCalled();
  expect(roomCardActivityDto(result, 'removed')).toEqual({ giftTotalCoins: '0', activeRedEnvelopeCount: 0 });
});
