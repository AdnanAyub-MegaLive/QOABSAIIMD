import { describe, expect, it, vi } from "vitest";
vi.mock("./prisma.js", () => ({ prisma: {} }));
vi.mock("./user-perks.js", () => ({ resolveUserPerks: async () => new Map() }));
vi.mock("./decoration-media.js", () => ({ decorationMedia: a => ({ url: a.publicId }), perkMediaFields: () => ({}) }));
import { getRoomRankings, requireRankingRoom } from "./room-rankings.js";
import { parseRoomRankingQuery, rankRoomScores, roomRankingPeriod } from "./room-ranking-contract.js";

describe("UTC period contract", () => {
  it.each([
    ["DAILY", "2026-10-25T23:59:59Z", "2026-10-25T00:00:00.000Z", "2026-10-26T00:00:00.000Z"],
    ["WEEKLY", "2026-10-25T23:59:59Z", "2026-10-19T00:00:00.000Z", "2026-10-26T00:00:00.000Z"],
    ["WEEKLY", "2026-10-26T00:00:00Z", "2026-10-26T00:00:00.000Z", "2026-11-02T00:00:00.000Z"],
    ["MONTHLY", "2028-02-29T23:59:59Z", "2028-02-01T00:00:00.000Z", "2028-03-01T00:00:00.000Z"],
    ["MONTHLY", "2026-12-31T23:59:59Z", "2026-12-01T00:00:00.000Z", "2027-01-01T00:00:00.000Z"],
  ])("%s boundaries %s", (period, date, start, end) => expect(roomRankingPeriod(period, new Date(date))).toMatchObject({ start, end, nextResetAt: end, timezone: "UTC" }));
  it.each(["page=0", "limit=51", "period=ALL", "category=BOGUS", "snapshotId=no", "page=2"])('rejects %s', q => expect(() => parseRoomRankingQuery(new URLSearchParams(q))).toThrow());
  it("defaults to daily Wealth", () => expect(parseRoomRankingQuery(new URLSearchParams())).toMatchObject({ period: "DAILY", category: "WEALTH", page: 1, limit: 20 }));
  it("preserves large sums and deterministic ties", () => {
    expect(rankRoomScores([{ userId: "b", score: "9007199254740993", gameId: "g" }, { userId: "a", score: "9007199254740993" }]).map(p => [p.userId, p.score, p.rank])).toEqual([["a", "9007199254740993", 1], ["b", "9007199254740993", 2]]);
    expect(rankRoomScores([{ userId: "a", score: "20", gameId: "g2" }, { userId: "a", score: "30", gameId: "g1" }])[0]).toMatchObject({ score: "50", games: [{ gameId: "g1", score: "30" }, { gameId: "g2", score: "20" }] });
  });
});

function fixture() {
  const now = new Date(); let revision = 1n, snapshot;
  const users = Array.from({ length: 5 }, (_, i) => ({ id: `u${i}`, publicId: `USR-${i}`, name: `Test ${i}`, specialIds: [], profileImage: null }));
  const rows = users.map(u => ({ category: "WEALTH", userId: u.id, score: "100" }));
  const db = {
    audioRoom: { findUnique: async () => ({ id: "room", roomId: "ROOM-test", ownerId: "owner", status: "LIVE", isBlocked: false }) },
    audioRoomBan: { findFirst: async () => null },
    audioRoomMember: { findUnique: async () => ({ socketCount: 1 }) },
    userBlock: { findFirst: async () => null, findMany: async () => [] }, ban: { findMany: async () => [], findFirst: async () => null },
    roomRankingRevision: { findMany: async () => [{ id: "ROOM-test", revision }, { id: "__visibility__", revision: 1n }, { id: "__coverage__", createdAt: now }] },
    roomRankingSnapshot: {
      findUnique: async ({ where }) => snapshot && (where.id === snapshot.id || where.cacheKey === snapshot.cacheKey) ? snapshot : null,
      upsert: async ({ create }) => (snapshot = { ...create, createdAt: now }),
    },
    $queryRaw: vi.fn(async sql => sql.text?.includes("contributions") ? rows : []), $executeRaw: async () => 0,
    user: { findMany: async ({ where }) => users.filter(u => where.id.in.includes(u.id)) },
    gameDefinition: { findMany: async () => [] }, uploadAsset: { findMany: async () => [] },
  };
  db.$transaction = async f => f(db);
  const input = { roomId: "ROOM-test", user: users[4], origin: "https://portal.example", query: { category: "WEALTH", period: "DAILY", page: 1, limit: 2 } };
  return { db, input, now, bump: () => revision++, snapshot: () => snapshot };
}
describe("snapshots and room access", () => {
  it("totals entire dataset, viewer outside first page, stable pages and cached reuse", async () => {
    const f = fixture(); const first = await getRoomRankings(f.input, f.db, f.now);
    expect(first).toMatchObject({ total: "500", totalParticipants: 5, hasMore: true, viewer: { ranked: true, rank: 5, score: "100" } });
    const second = await getRoomRankings({ ...f.input, query: { ...f.input.query, page: 2, snapshotId: first.snapshotId } }, f.db, f.now);
    expect(second.entries.map(e => e.rank)).toEqual([3, 4]);
    expect(second.snapshotId).toBe(first.snapshotId);
    expect(f.db.$queryRaw.mock.calls.filter(([q]) => q.text?.includes("contributions"))).toHaveLength(1);
    expect(second.entries[0]).not.toHaveProperty("userId");
    expect(first.counters.WEALTH.total).toBe(first.total);
  });
  it("invalidates pages after source changes", async () => {
    const f = fixture(); const first = await getRoomRankings(f.input, f.db, f.now); f.bump();
    await expect(getRoomRankings({ ...f.input, query: { ...f.input.query, page: 2, snapshotId: first.snapshotId } }, f.db, f.now)).rejects.toMatchObject({ code: "SNAPSHOT_EXPIRED" });
  });
  it("isolates blocked visibility and period snapshots", async () => {
    const f = fixture(); const first = await getRoomRankings(f.input, f.db, f.now);
    f.db.userBlock.findMany = async () => [{ blockerId: "u4", blockedId: "u0" }];
    await expect(getRoomRankings({ ...f.input, query: { ...f.input.query, snapshotId: first.snapshotId } }, f.db, f.now)).rejects.toMatchObject({ code: "SNAPSHOT_EXPIRED" });
    f.db.userBlock.findMany = async () => [];
    await expect(getRoomRankings({ ...f.input, query: { ...f.input.query, period: "MONTHLY", snapshotId: first.snapshotId } }, f.db, f.now)).rejects.toMatchObject({ code: "SNAPSHOT_EXPIRED" });
  });
  it("returns explicit empty/unranked and partial game coverage", async () => {
    const f = fixture(); const r = await getRoomRankings({ ...f.input, query: { ...f.input.query, category: "GAMES" } }, f.db, f.now);
    expect(r).toMatchObject({ total: "0", entries: [], totalParticipants: 0, hasMore: false, status: "PARTIAL", viewer: { ranked: false, rank: null } });
    expect(r.coverage.externalProviders).toBe("UNAVAILABLE");
  });
  it.each(["outsider", "banned", "blocked", "unavailable"])("rejects %s", async kind => {
    const f = fixture();
    if (kind === "outsider") f.db.audioRoomMember.findUnique = async () => null;
    if (kind === "banned") f.db.audioRoomBan.findFirst = async () => ({ id: "ban" });
    if (kind === "blocked") f.db.userBlock.findFirst = async () => ({ blockerId: "owner" });
    if (kind === "unavailable") f.db.audioRoom.findUnique = async () => null;
    await expect(requireRankingRoom(f.db, "ROOM-test", f.input.user)).rejects.toHaveProperty("status");
  });
});
