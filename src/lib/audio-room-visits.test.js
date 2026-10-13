import { expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { recordAudioRoomVisit, visitPageOptions, visitCursor, recentRoomWhere } from "./audio-room-visits.js";

it("records authenticated identity with a unique-pair atomic upsert and server time", async () => {
  const db = { $executeRaw: vi.fn() };
  await recordAudioRoomVisit(db, "user-a", "room-a");
  const [sql, ...values] = db.$executeRaw.mock.calls[0];
  expect(values).toEqual(["user-a", "room-a"]);
  expect(sql.join("")).toContain('ON CONFLICT ("userId", "audioRoomId")');
  expect(sql.join("")).toContain("GREATEST");
  expect(sql.join("")).toContain("clock_timestamp()");
});
it("uses bounded cursor pagination with stable timestamp and ID ordering", () => {
  const row = { audioRoomId: "room-a", lastVisitedAt: new Date("2026-10-13T12:00:00.000Z") };
  expect(visitPageOptions(new URLSearchParams({ cursor: visitCursor(row), limit: "50" }))).toEqual({ limit: 50, cursor: row });
  expect(visitPageOptions(new URLSearchParams())).toEqual({ limit: 20, cursor: null });
  for (const query of ["limit=0", "limit=51", "limit=1.2", "cursor=invalid", "cursor=e30"]) {
    expect(() => visitPageOptions(new URLSearchParams(query))).toThrow();
  }
});
it("scopes history to caller and permits idle/empty rooms without a country filter", () => {
  const where = recentRoomWhere("user-a", null);
  expect(where.userId).toBe("user-a");
  expect(where.audioRoom.status.in).toEqual(["LIVE", "IDLE"]);
  expect(where.audioRoom).not.toHaveProperty("country");
  expect(where.audioRoom).not.toHaveProperty("participantCount");
  expect(where.audioRoom).toMatchObject({ isBlocked: false, owner: { deletedAt: null, status: "ACTIVE" }, roomBans: { none: { userId: "user-a", revokedAt: null } } });
});
it("paginates past a boundary without trusting cursor identity as the caller", () => {
  const cursor = { audioRoomId: "r", lastVisitedAt: new Date() };
  expect(recentRoomWhere("user-a", cursor).OR).toEqual([
    { lastVisitedAt: { lt: cursor.lastVisitedAt } },
    { lastVisitedAt: cursor.lastVisitedAt, audioRoomId: { lt: "r" } },
  ]);
});
it("records only inside the checked join path, after snapshot preparation and before success", () => {
  const source = readFileSync(new URL("../../server.js", import.meta.url), "utf8");
  const join = source.slice(source.indexOf("const handleAudioRoomJoin="), source.indexOf('socket.on("audio-room:join"'));
  const record = join.indexOf("await recordAudioRoomVisit");
  for (const check of ["ROOM_BANNED", "ROOM_PASSWORD_REQUIRED", "ROOM_PAYMENT_REQUIRED", "await Promise.all"]) expect(join.indexOf(check)).toBeLessThan(record);
  expect(record).toBeLessThan(join.indexOf("joinSucceeded=true"));
});
