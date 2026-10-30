import { describe, it, expect, vi } from "vitest";
import { announcementDefaults, validateAnnouncementPolicy, qualifiesForAnnouncement } from "./global-announcement-policy.js";
import { announcementCandidatesSql, collectAnnouncements, dispatchAnnouncements, isPublicAnnouncementRoom, runGlobalAnnouncements } from "./global-announcements.js";

const policy = () => ({ ...structuredClone(announcementDefaults), revision: 1, updatedAt: new Date(0),
  rules: Object.fromEntries(["BIG_GIFT", "GAME_WIN", "LUCKY_RETURN"].map(t => [t, { enabled: true, minimumCoins: "100" }])) });
const room = { id: "room-internal", roomId: "ROOM-1", ownerId: "owner", status: "LIVE", privacyMode: "PUBLIC" };
function fixture() {
  const now = new Date();
  const row = { id: "announcement-1", actorId: "actor", roomId: "ROOM-1", type: "BIG_GIFT", sourceIds: ["gift-1"],
    expiresAt: new Date(now.getTime() + 60000), payload: { policyRevision: 1, type: "BIG_GIFT", amount: "100", unit: "COINS" } };
  const users = ["actor", "owner", "viewer", "blocked", "banned"].map(id => ({ id, sessionVersion: 1 }));
  const sockets = users.map(u => ({ data: { internalUserId: u.id, sessionVersion: 1 }, emit: vi.fn() }));
  sockets.push({ data: { internalUserId: "viewer", sessionVersion: 0 }, emit: vi.fn() });
  const db = {
    globalAnnouncement: { findMany: vi.fn().mockResolvedValue([row]), updateMany: vi.fn().mockResolvedValue({ count: 1 }), create: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn(), findFirst: vi.fn().mockResolvedValue(null) },
    globalAnnouncementPolicy: { findUnique: vi.fn().mockResolvedValue(policy()) },
    audioRoom: { findUnique: vi.fn().mockResolvedValue(room) },
    user: { findUnique: vi.fn().mockResolvedValue({ id: "actor", publicId: "USR-1", name: "QA", status: "ACTIVE" }), findMany: vi.fn().mockResolvedValue(users) },
    userBlock: { findMany: vi.fn().mockResolvedValue([{ blockerId: "blocked", blockedId: "actor" }]) },
    ban: { findMany: vi.fn().mockResolvedValue([{ userId: "banned" }]) },
    audioRoomBan: { findMany: vi.fn().mockResolvedValue([]) },
    giftTransaction: { count: vi.fn().mockResolvedValue(1) },
    sharedGameEntry: { count: vi.fn().mockResolvedValue(1) },
    $queryRaw: vi.fn().mockResolvedValueOnce([{ locked: true }]).mockResolvedValue([]),
  };
  db.$transaction = vi.fn(fn => fn(db));
  return { db, row, now, sockets, io: { fetchSockets: vi.fn().mockResolvedValue(sockets) } };
}

describe("global announcement policy", () => {
  it("defaults off; validates three independent exact thresholds", () => {
    expect(Object.values(announcementDefaults.rules).every(r => !r.enabled)).toBe(true);
    const p = policy(); p.rules.BIG_GIFT.minimumCoins = "999999999999999999";
    expect(validateAnnouncementPolicy(p).rules.BIG_GIFT.minimumCoins).toBe("999999999999999999");
    expect(qualifiesForAnnouncement({ type: "BIG_GIFT", amount: "999999999999999998" }, p)).toBe(false);
    expect(qualifiesForAnnouncement({ type: "BIG_GIFT", amount: "999999999999999999" }, p)).toBe(true);
  });
  it.each(["0", "-1", "1.5", "1e6", "1000000000000000000"])("rejects unsafe threshold %s", minimumCoins => {
    const p = policy(); p.rules.GAME_WIN.minimumCoins = minimumCoins;
    expect(() => validateAnnouncementPolicy(p)).toThrow();
  });
  it("does not treat disabled rules or zero returns as wins", () => {
    expect(qualifiesForAnnouncement({ type: "BIG_GIFT", amount: "999999" }, announcementDefaults)).toBe(false);
    expect(qualifiesForAnnouncement({ type: "GAME_WIN", amount: "0" }, policy())).toBe(false);
  });
});
describe("source and visibility safeguards", () => {
  it("queries committed, paid gifts and complete settled Coin rounds, with receipt deduplication", () => {
    const text = announcementCandidatesSql(new Date(0), new Date()).sql;
    expect(text).toContain('g."reversedAt" IS NULL');
    expect(text).toContain("s.data->>'source' = 'COINS'");
    expect(text).toContain("bool_and(e.status = 'SETTLED')");
    expect(text).toContain("SUM((e.result->>'payout')::numeric) - SUM(e.amount)");
    expect(text).toContain('"GlobalAnnouncement" a WHERE a.id = c.id');
    expect(text).toContain("LIMIT 100");
  });
  it.each([{ privacyMode: "PRIVATE" }, { passwordHash: "secret" }, { isBlocked: true }, { paidEntryCoins: 1 }, { status: "CLOSED" }])("excludes restricted rooms %j", override => {
    expect(isPublicAnnouncementRoom({ ...room, ...override })).toBe(false);
  });
  it("filters blocked, banned and stale-session viewers; exposes no internal identities", async () => {
    const f = fixture(); await dispatchAnnouncements(f.db, f.io, f.now);
    expect(f.sockets[2].emit).toHaveBeenCalledOnce();
    for (const i of [3, 4, 5]) expect(f.sockets[i].emit).not.toHaveBeenCalled();
    const payload = f.sockets[2].emit.mock.calls[0][1];
    expect(payload.data.actor).toEqual({ publicId: "USR-1", name: "QA" });
    expect(payload.data.sourceIds).toBeUndefined();
  });
  it("does not broadcast reversed gifts", async () => {
    const f = fixture(); f.db.giftTransaction.count.mockResolvedValue(0);
    await dispatchAnnouncements(f.db, f.io, f.now);
    expect(f.io.fetchSockets).not.toHaveBeenCalled();
  });
  it("does not broadcast if disabled after collection", async () => {
    const f = fixture(); f.db.globalAnnouncementPolicy.findUnique.mockResolvedValue(announcementDefaults);
    await dispatchAnnouncements(f.db, f.io, f.now);
    expect(f.io.fetchSockets).not.toHaveBeenCalled();
  });
  it("a second worker cannot deliver a claimed announcement", async () => {
    const f = fixture(); f.db.globalAnnouncement.updateMany.mockResolvedValue({ count: 0 });
    await dispatchAnnouncements(f.db, f.io, f.now);
    expect(f.io.fetchSockets).not.toHaveBeenCalled();
  });
  it("an emission error leaves the durable announcement unacknowledged for retry", async () => {
    const f = fixture(); f.io.fetchSockets.mockRejectedValue(new Error("offline"));
    await expect(dispatchAnnouncements(f.db, f.io, f.now)).rejects.toThrow("offline");
    expect(f.db.globalAnnouncement.updateMany).toHaveBeenCalledTimes(1);
  });
  it("records cooldown suppression without queueing more banners", async () => {
    const f = fixture(); f.db.$queryRaw.mockReset().mockResolvedValueOnce([{ locked: true }]).mockResolvedValueOnce([
      { id: "a", type: "BIG_GIFT", actorId: "actor", roomId: "ROOM-1", amount: "100", confirmed: f.now, sourceIds: ["gift"], details: {} },
    ]);
    f.db.globalAnnouncement.findFirst.mockResolvedValue({ id: "earlier" });
    await collectAnnouncements(f.db, f.now);
    expect(f.db.globalAnnouncement.createMany.mock.calls[0][0].data[0].deliveredAt).toEqual(f.now);
  });
  it("does nothing with all switches off", async () => {
    const f = fixture(); f.db.globalAnnouncementPolicy.findUnique.mockResolvedValue({ ...announcementDefaults });
    await collectAnnouncements(f.db, f.now);
    expect(f.db.$queryRaw).toHaveBeenCalledTimes(1);
    expect(f.db.globalAnnouncement.create).not.toHaveBeenCalled();
  });
  it("coalesces overlapping worker ticks", async () => {
    const f = fixture(); let release;
    f.db.$transaction.mockImplementationOnce(() => new Promise(resolve => { release = resolve; })).mockResolvedValue(undefined);
    const first = runGlobalAnnouncements(f.db, f.io);
    await runGlobalAnnouncements(f.db, f.io);
    expect(f.db.$transaction).toHaveBeenCalledTimes(1);
    release(); await first;
    expect(f.db.$transaction).toHaveBeenCalledTimes(2);
  });
});

it('batches suppressed receipts while preserving same-batch cooldown for visible announcements', async()=>{
 const f=fixture();const c={type:'BIG_GIFT',actorId:'actor',roomId:'ROOM-1',amount:'100',confirmed:f.now,sourceIds:['gift'],details:{}};
 f.db.$queryRaw.mockReset().mockResolvedValueOnce([{locked:true}]).mockResolvedValueOnce([{...c,id:'visible'},...Array.from({length:99},(_,i)=>({...c,id:`suppressed-${i}`}))]);
 f.db.globalAnnouncement.findFirst.mockResolvedValueOnce(null).mockResolvedValue({id:'visible'});
 await collectAnnouncements(f.db,f.now);
 expect(f.db.globalAnnouncement.create).toHaveBeenCalledTimes(1);
 expect(f.db.globalAnnouncement.createMany).toHaveBeenCalledTimes(1);
 expect(f.db.globalAnnouncement.createMany.mock.calls[0][0].data).toHaveLength(99);
 expect(f.db.globalAnnouncement.createMany.mock.calls[0][0].data.every(r=>r.deliveredAt===f.now)).toBe(true);
});
