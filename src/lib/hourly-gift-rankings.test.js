import { describe, expect, it, vi } from "vitest";
vi.mock("./prisma.js", () => ({ prisma: {} }));
vi.mock("./user-perks.js", () => ({ resolveUserPerks: async () => new Map() }));
vi.mock("./decoration-media.js", () => ({ perkMediaFields: () => ({}) }));
import { giftHours, hourlyCacheAction, hourlyViewerPosition, orderHourlyScores } from "./hourly-gift-ranking-contract.js";
import { accessibleHourlyRooms, getHourlyGiftRankings, hourlyScoreSnapshot } from "./hourly-gift-rankings.js";

describe("fixed UTC hours and Top 50 threshold", () => {
  it("uses fixed hours, including year rollover, never a rolling hour", () => {
    const h = giftHours(new Date("2026-12-31T23:59:59.999Z"));
    expect(h).toMatchObject({ timezone: "UTC", hourId: "2026-12-31T23:00:00.000Z", nextResetAt: "2027-01-01T00:00:00.000Z", previous: { start: "2026-12-31T22:00:00.000Z", end: "2026-12-31T23:00:00.000Z" } });
    expect(giftHours(new Date(h.nextResetAt)).previous).toEqual(h.current);
  });
  it("keeps scores larger than Number.MAX_SAFE_INTEGER exact and breaks ties by stable identity", () => {
    const result = orderHourlyScores([{ userId: "b", score: "9007199254740993" }, { userId: "a", score: "9007199254740993" }, { userId: "c", score: "9007199254740992" }], new Set(["a", "b", "c"]));
    expect(result.map(r => r.userId)).toEqual(["a", "b", "c"]);
    expect(result[0].score).toBe("9007199254740993");
  });
  it.each([0, 1, 49])("requires one additional Coin for an unranked viewer with %s participants", count => {
    const rows = Array.from({ length: count }, (_, i) => ({ userId: `u${i}`, score: "100", rank: i + 1 }));
    expect(hourlyViewerPosition(rows, "viewer")).toMatchObject({ ranked: false, rank: null, sentCoins: "0", inTop50: false, additionalCoinsToTop50: "1" });
  });
  it("zero additional only for a qualifying viewer", () => {
    expect(hourlyViewerPosition([{ userId: "me", score: "1", rank: 1 }], "me")).toMatchObject({ ranked: true, inTop50: true, additionalCoinsToTop50: "0" });
  });
  it("threshold uses the 50th sender and the same tie break, not a hardcoded minimum", () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({ userId: `m${String(i).padStart(2, "0")}`, score: "1000", rank: i + 1 }));
    expect(hourlyViewerPosition(rows, "aaa").additionalCoinsToTop50).toBe("1000");
    expect(hourlyViewerPosition(rows, "zzz").additionalCoinsToTop50).toBe("1001");
    const outsider = [...rows, { userId: "zzz", score: "700", rank: 51 }];
    expect(hourlyViewerPosition(outsider, "zzz")).toMatchObject({ rank: 51, sentCoins: "700", additionalCoinsToTop50: "301" });
  });
  it("joining a tied Top 50 needs one Coin when the tie break loses", () => {
    const rows = Array.from({ length: 51 }, (_, i) => ({ userId: `u${String(i).padStart(2, "0")}`, score: "9007199254740993" }));
    const ranked = orderHourlyScores(rows, new Set(rows.map(r => r.userId)));
    expect(hourlyViewerPosition(ranked, "u50")).toMatchObject({ rank: 51, inTop50: false, additionalCoinsToTop50: "1" });
  });
  it("filters invisible identities before rank and threshold calculation", () => {
    const ranked = orderHourlyScores([{ userId: "hidden", score: "5000" }, { userId: "me", score: "4" }, { userId: "zero", score: "0" }], new Set(["me", "zero"]));
    expect(ranked).toEqual([{ userId: "me", score: "4", rank: 1 }]);
  });
  it("coalesces changes only for two seconds and never past expiry", () => {
    const start = new Date("2026-10-23T17:59:58Z");
    const cache = { generatedAt: start, expiresAt: new Date("2026-10-23T18:00:00Z"), sourceRevision: "1" };
    expect(hourlyCacheAction(cache, "1", start)).toBe("REUSE");
    expect(hourlyCacheAction(cache, "2", new Date(start.getTime() + 1999))).toBe("COALESCE");
    expect(hourlyCacheAction(cache, "2", cache.expiresAt)).toBe("REBUILD");
  });
});

function fixture() {
  let now = new Date("2026-10-23T17:10:00Z"), revision = 1n;
  const cache = new Map(), hidden = new Set();
  const people = Array.from({ length: 55 }, (_, i) => ({ id: `u${String(i).padStart(2, "0")}`, publicId: `USR-${i}`, name: `Person ${i}`, profileImage: null, specialIds: [] }));
  let rows = people.map(p => ({ kind: "SCORE", period: "current", userId: p.id, score: "100" }));
  rows.push({ kind: "SCORE", period: "previous", userId: "u00", score: "900" });
  let tail = Promise.resolve();
  const db = {
    roomRankingRevision: { findMany: async () => [{ id: "__hourly_gifts__", revision }] },
    hourlyGiftRankingCache: { findUnique: async ({ where }) => cache.get(where.id) ?? null, upsert: async ({ where, create, update }) => { const value = cache.has(where.id) ? { id: where.id, ...update } : create; cache.set(where.id, value); return value; } },
    $queryRaw: vi.fn(async q => q.text?.includes('FROM "GiftTransaction"') ? rows : [{ locked: 1 }]), $executeRaw: async () => 0,
    userBlock: { findMany: async () => [], findFirst: async () => null },
    user: { findMany: async ({ where, select }) => people.filter(p => where.id.in.includes(p.id) && !hidden.has(p.id)).map(p => select.publicId ? p : { id: p.id }) },
    audioRoomMember: { findMany: async () => [], findUnique: async () => null },
    audioRoomBan: { findFirst: async () => null }, audioRoomAdmission: { findUnique: async () => null },
  };
  // Simulate the database advisory lock so concurrent requests share the build.
  db.$transaction = fn => { const next = tail.then(() => fn(db)); tail = next.catch(() => {}); return next; };
  return { db, user: people[54], clock: () => now, setTime: n => now = new Date(n), bump: () => revision++, setRows: r => rows = r, hidden, cache };
}
describe("hourly response and caching", () => {
  it("one snapshot supplies current list, header and off-page viewer", async () => {
    const f = fixture(), r = await getHourlyGiftRankings({ user: f.user, origin: "https://portal.example" }, f.db, f.clock);
    expect(r.currentHour.entries).toHaveLength(50);
    expect(r.viewer).toMatchObject({ publicId: "USR-54", rank: 55, sentCoins: "100", inTop50: false, additionalCoinsToTop50: "1" });
    expect(r.header).toMatchObject({ hourId: r.hourId, revision: r.revision, rank: r.viewer.rank, sentCoins: r.viewer.sentCoins });
    expect(r.currentHour).toMatchObject({ totalParticipants: 55, totalSentCoins: "5500" });
    expect(r.previousHour.entries).toHaveLength(1);
    expect(r.previousHour.entries[0].liveRoom).toBeNull();
    expect(JSON.stringify(r)).not.toMatch(/"userId"|coinBalance|payout|wallet/i);
  });
  it("coalesces combo invalidation, then rebuilds; unchanged content keeps revision", async () => {
    const f = fixture(), input = { user: f.user, origin: "https://portal.example" };
    const first = await getHourlyGiftRankings(input, f.db, f.clock);
    f.bump(); f.setTime("2026-10-23T17:10:01Z");
    const stale = await getHourlyGiftRankings(input, f.db, f.clock);
    expect(stale.status).toBe("STALE"); expect(stale.refreshAfterMs).toBe(1000); expect(stale.revision).toBe(first.revision);
    f.setTime("2026-10-23T17:10:02Z");
    const fresh = await getHourlyGiftRankings(input, f.db, f.clock);
    expect(fresh.stale).toBe(false); expect(fresh.revision).toBe(first.revision);
    expect(f.db.$queryRaw.mock.calls.filter(([q]) => q.text?.includes('FROM "GiftTransaction"'))).toHaveLength(2);
  });
  it("concurrent readers compute global aggregate once", async () => {
    const f = fixture();
    await Promise.all(Array.from({ length: 20 }, () => hourlyScoreSnapshot(f.db, f.clock)));
    expect(f.db.$queryRaw.mock.calls.filter(([q]) => q.text?.includes('FROM "GiftTransaction"'))).toHaveLength(1);
  });
  it("two phones with the same account return consistent positions and content revision", async () => {
    const f = fixture(), input = { user: f.user, origin: "https://portal.example" };
    const [a, b] = await Promise.all([getHourlyGiftRankings(input, f.db, f.clock), getHourlyGiftRankings(input, f.db, f.clock)]);
    expect(a).toEqual(b);
  });
  it("rechecks visibility even on a cached aggregate and recalculates previous podium", async () => {
    const f = fixture(), input = { user: f.user, origin: "https://portal.example" };
    await getHourlyGiftRankings(input, f.db, f.clock); f.hidden.add("u00");
    const r = await getHourlyGiftRankings(input, f.db, f.clock);
    expect(r.currentHour.totalParticipants).toBe(54); expect(r.viewer.rank).toBe(54); expect(r.previousHour.entries).toEqual([]);
    expect(r.currentHour.entries[0]).toMatchObject({ rank: 1, publicId: "USR-1" });
  });
  it("returns true empty, never sample users, with positive entry requirement", async () => {
    const f = fixture(); f.setRows([]);
    const r = await getHourlyGiftRankings({ user: f.user, origin: "https://portal.example" }, f.db, f.clock);
    expect(r).toMatchObject({ status: "AVAILABLE", currentHour: { entries: [], totalParticipants: 0, totalSentCoins: "0" }, previousHour: { entries: [] }, viewer: { rank: null, ranked: false, sentCoins: "0", additionalCoinsToTop50: "1" } });
  });
  it("unverified spending makes affected-hour values unknown rather than a fake zero/rank", async () => {
    const f = fixture(); f.setRows([{ kind: "UNVERIFIED", period: "current", userId: null, score: "1" }]);
    const r = await getHourlyGiftRankings({ user: f.user, origin: "https://portal.example" }, f.db, f.clock);
    expect(r).toMatchObject({ status: "PARTIAL", currentHour: { coverageStatus: "UNAVAILABLE", totalParticipants: null, totalSentCoins: null, entries: [] }, viewer: { ranked: null, rank: null, sentCoins: null, inTop50: null, additionalCoinsToTop50: null }, header: { sentCoins: null, rank: null }, previousHour: { coverageStatus: "AVAILABLE", entries: [], totalParticipants: 0 } });
  });
  it("advances current and previous together without reusing the old current hour", async () => {
    const f = fixture(); await hourlyScoreSnapshot(f.db, f.clock);
    f.setTime("2026-10-23T18:00:00Z"); f.setRows([{ kind: "SCORE", period: "previous", userId: "u00", score: "100" }]);
    const r = await getHourlyGiftRankings({ user: f.user, origin: "https://portal.example" }, f.db, f.clock);
    expect(r.currentHour.start).toBe("2026-10-23T18:00:00.000Z");
    expect(r.previousHour.start).toBe("2026-10-23T17:00:00.000Z"); expect(r.currentHour.entries).toEqual([]); expect(r.previousHour.entries).toHaveLength(1);
  });
  it("missing migration is unavailable, not zero", async () => {
    const f = fixture(); f.db.roomRankingRevision.findMany = async () => [];
    await expect(hourlyScoreSnapshot(f.db, f.clock)).rejects.toMatchObject({ code: "HOURLY_RANKINGS_UNAVAILABLE", status: 503 });
  });
  it("rejects old-hour data if the hour changes during final database checks", async () => {
    const f = fixture(); let calls = 0;
    f.db.roomRankingRevision.findMany = async () => { if (++calls === 2) f.setTime("2026-10-23T18:00:00Z"); return [{ id: "__hourly_gifts__", revision: 1n }]; };
    await expect(getHourlyGiftRankings({ user: f.user, origin: "https://portal.example" }, f.db, f.clock)).rejects.toMatchObject({ code: "HOUR_CHANGED", status: 409 });
  });
  it.each(["owner-block", "room-ban", "password", "paid"])("does not disclose inaccessible live rooms: %s", async why => {
    const f = fixture();
    f.db.audioRoomMember.findMany = async () => [{ audioRoom: { id: "r", roomId: "ROOM-private", title: "Private", ownerId: "owner", status: "LIVE", privacyMode: why === "paid" ? "PAID" : "PUBLIC", passwordHash: why === "password" ? "secret" : null } }];
    if (why === "owner-block") f.db.userBlock.findFirst = async () => ({});
    if (why === "room-ban") f.db.audioRoomBan.findFirst = async () => ({ reason: "test" });
    expect((await accessibleHourlyRooms(f.db, ["u00"], f.user.id, f.clock())).size).toBe(0);
  });
  it("returns only safe fields for accessible live rooms", async () => {
    const f = fixture();
    f.db.audioRoomMember.findMany = async () => [{ audioRoom: { id: "internal", roomId: "ROOM-live", title: "Live", ownerId: "owner", status: "LIVE", privacyMode: "PUBLIC", paidEntryCoins: 90000n } }];
    expect((await accessibleHourlyRooms(f.db, ["u00"], f.user.id, f.clock())).get("u00")).toEqual({ roomId: "ROOM-live", title: "Live" });
  });
});
