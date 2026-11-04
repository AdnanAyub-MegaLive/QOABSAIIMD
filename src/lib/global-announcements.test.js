import { describe, it, expect, vi } from "vitest";
import { announcementDefaults, validateAnnouncementPolicy, qualifiesForAnnouncement } from "./global-announcement-policy.js";
import { queueRocketAnnouncement, announcementCandidatesSql, collectAnnouncements, dispatchAnnouncements, isPublicAnnouncementRoom, runGlobalAnnouncements } from "./global-announcements.js";

const policy = () => ({ ...structuredClone(announcementDefaults), revision: 1, updatedAt: new Date(0),
  rules: { ROCKET_LAUNCH: { enabled: true, minimumLevel: 1 }, ...Object.fromEntries(["BIG_GIFT", "GAME_WIN", "LUCKY_RETURN"].map(t => [t, { enabled: true, minimumCoins: "100" }])) } });
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
    userEquippedProp: { findMany: vi.fn().mockResolvedValue([]) },
    giftRecoverySnapshot: { findUnique: vi.fn().mockResolvedValue(null) },
    giftTransaction: { count: vi.fn().mockResolvedValue(1), findUnique: vi.fn().mockResolvedValue({ senderId: "actor", roomId: "ROOM-1", recipientUser: { id: "owner", publicId: "USR-2", name: "Receiver", status: "ACTIVE", profileImage: "https://media.example/receiver.png" } }) },
    sharedGameEntry: { count: vi.fn().mockResolvedValue(1) },
    $queryRaw: vi.fn().mockResolvedValueOnce([{ locked: true }]).mockResolvedValue([]),
  };
  db.$transaction = vi.fn(fn => fn(db));
  return { db, row, now, sockets, io: { fetchSockets: vi.fn().mockResolvedValue(sockets) } };
}

describe("global announcement policy", () => {
  it("defaults off; validates three independent exact thresholds", () => {
    expect(["BIG_GIFT","LUCKY_RETURN","GAME_WIN"].every(type => !announcementDefaults.rules[type].enabled)).toBe(true);
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
    expect(payload.data.actor).toEqual({ publicId: "USR-1", name: "QA", profileImage: null, frameUrl: null });
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
    await dispatchAnnouncements(f.db, f.io, f.now);
    expect(f.db.globalAnnouncement.updateMany).toHaveBeenCalledTimes(2);
    expect(f.db.globalAnnouncement.updateMany.mock.calls[1][0].data).toEqual({ leaseUntil: expect.any(Date) });
  });
  it("records cooldown suppression without queueing more banners", async () => {
    const f = fixture(); f.db.$queryRaw.mockReset().mockResolvedValueOnce([{ locked: true }]).mockResolvedValueOnce([
      { id: "a", type: "BIG_GIFT", actorId: "actor", roomId: "ROOM-1", amount: "100", confirmed: f.now, sourceIds: ["gift"], details: {} },
    ]);
    f.db.globalAnnouncement.findFirst.mockResolvedValue({ id: "earlier" });
    await collectAnnouncements(f.db, f.now);
    expect(f.db.globalAnnouncement.createMany.mock.calls[0][0].data[0].deliveredAt).toEqual(f.now);
  });
  it("skips collecting coin events when only Rocket launches are enabled", async () => {
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

it("shares socket enumeration across a full batch and drains the next batch immediately", async () => {
  const f = fixture();
  const rows = Array.from({ length: 10 }, (_, i) => ({ ...f.row, id: "drain-" + i }));
  f.db.globalAnnouncement.findMany.mockResolvedValueOnce(rows).mockResolvedValueOnce([]);
  await runGlobalAnnouncements(f.db, f.io);
  expect(f.db.globalAnnouncement.findMany).toHaveBeenCalledTimes(2);
  expect(f.io.fetchSockets).toHaveBeenCalledTimes(1);
});

it("dispatches pending announcements even when collection fails", async () => {
  const f = fixture();
  f.row.id = "collection-failure-unique";
  f.db.$transaction.mockRejectedValue(new Error("collection failed"));
  await runGlobalAnnouncements(f.db, f.io);
  expect(f.db.globalAnnouncement.findMany).toHaveBeenCalled();
  expect(f.sockets[2].emit).toHaveBeenCalledOnce();
});
it("continues to healthy pending rows after a failed full batch", async () => {
  const f = fixture();
  f.db.globalAnnouncement.findMany.mockResolvedValueOnce(Array.from({length:10},(_,i)=>({...f.row,id:`failed-batch-${i}`})))
    .mockResolvedValueOnce([{...f.row,id:"healthy-after-failure"}]);
  f.io.fetchSockets.mockRejectedValueOnce(new Error("temporary failure")).mockResolvedValue(f.sockets);
  await runGlobalAnnouncements(f.db,f.io);
  expect(f.db.globalAnnouncement.findMany).toHaveBeenCalledTimes(2);
  expect(f.sockets[2].emit).toHaveBeenCalledOnce();
});


describe("announcement recipient artwork", () => {
  it.each(["BIG_GIFT", "LUCKY_RETURN"])("includes the first recipient and count for %s without exposing source IDs", async type => {
    const f = fixture(); f.row.id = `artwork-${type}`; f.row.type = type;
    f.db.giftRecoverySnapshot.findUnique.mockResolvedValue({ data: { announcementRecipients: { firstGiftId: "first", count: 26 } } });
    f.db.userEquippedProp.findMany.mockResolvedValue([{userId:"owner",category:"FRAMES",asset:{publicId:"AST-frame",category:"FRAMES",isGlobal:true,mimeType:"image/png",assignments:[]}}]);
    f.db.uploadAsset = {findMany:vi.fn().mockResolvedValue([{publicId:"AST-frame",category:"FRAMES",mimeType:"image/png",mediaVersion:"v2"}])};
    vi.stubEnv("MOBILE_API_BASE_URL", "https://portal.megachat.live");
    vi.stubEnv("AUTH_SECRET", "test-only-announcement-signing-key");
    try {
      await dispatchAnnouncements(f.db, f.io, f.now);
      const data = f.sockets[2].emit.mock.calls[0][1].data;
      expect(data.recipient).toMatchObject({publicId:"USR-2",name:"Receiver",profileImage:"https://media.example/receiver.png"});
      expect(data.recipient.frameUrl).toContain("/api/uploads/AST-frame/file?");
      expect(data.recipient.frameUrl).toContain("displaySig=");
      expect(data.recipientCount).toBe(26);
      expect(f.db.giftTransaction.findUnique.mock.calls[0][0].where.id).toBe("first");
      expect(JSON.stringify(data)).not.toContain("firstGiftId");
    } finally { vi.unstubAllEnvs(); }
  });
  it("hides a recipient from viewers who blocked them", async () => {
    const f=fixture(); f.row.id="recipient-block";
    f.db.userBlock.findMany.mockResolvedValue([{blockerId:"viewer",blockedId:"owner"}]);
    await dispatchAnnouncements(f.db,f.io,f.now);
    expect(f.sockets[2].emit).not.toHaveBeenCalled();
  });
  it("resolves legacy talent recipients to their mapped public user", async () => {
    const f=fixture(); f.row.id="legacy-recipient";
    f.db.giftTransaction.findUnique.mockResolvedValue({senderId:"actor",roomId:"ROOM-1",recipientUser:null,talent:{publicId:"TLN-2"}});
    f.db.user.findUnique.mockResolvedValueOnce({id:"actor",publicId:"USR-1",name:"Sender",status:"ACTIVE"}).mockResolvedValueOnce({id:"owner",publicId:"TLN-2",name:"Talent",status:"ACTIVE"});
    await dispatchAnnouncements(f.db,f.io,f.now);
    expect(f.sockets[2].emit.mock.calls[0][1].data.recipient.publicId).toBe("TLN-2");
  });
  it("suppresses missing recipients instead of exposing a different identity", async () => {
    const f=fixture(); f.row.id="missing-recipient"; f.db.giftTransaction.findUnique.mockResolvedValue(null);
    await dispatchAnnouncements(f.db,f.io,f.now);
    expect(f.io.fetchSockets).not.toHaveBeenCalled();
  });
});

it("adds actor artwork to game wins without a gift recipient", async () => {
  const f=fixture(); f.row.id="game-artwork"; f.row.type="GAME_WIN";
  f.db.user.findUnique.mockResolvedValue({id:"actor",publicId:"USR-1",name:"Player",status:"ACTIVE",profileImage:"https://media.example/sender.png"});
  await dispatchAnnouncements(f.db,f.io,f.now);
  const data=f.sockets[2].emit.mock.calls[0][1].data;
  expect(data.actor.profileImage).toBe("https://media.example/sender.png");
  expect(data.recipient).toBeUndefined(); expect(data.recipientCount).toBeUndefined();
  expect(f.db.giftRecoverySnapshot.findUnique).not.toHaveBeenCalled();
});

it("queues public Rocket launches by launch ID and dispatches the actor-only banner through audience filters", async()=>{
  const f=fixture();
  f.db.audioRoom.findUnique.mockResolvedValue({...room,title:"🌙".repeat(45)});
  await queueRocketAnnouncement(f.db,"launch",room.roomId,3,null,f.now);
  const {data:[receipt],skipDuplicates}=f.db.globalAnnouncement.createMany.mock.calls[0][0];
  expect(skipDuplicates).toBe(true);
  expect(receipt).toMatchObject({id:"ROCKET_LAUNCH:launch",sourceIds:["launch"],actorId:"owner",payload:{amount:"0",details:{level:3,roomTitle:"🌙".repeat(40)}}});
  f.db.globalAnnouncement.findMany.mockResolvedValue([{...receipt,actorId:"actor"}]);
  f.db.roomRocketLaunch={findUnique:vi.fn().mockResolvedValue({roomId:room.roomId,level:3})};
  await dispatchAnnouncements(f.db,f.io,f.now);
  const [event,{data}]=f.sockets[2].emit.mock.calls[0];
  expect(event).toBe("global:announcement"); expect(data.announcementId).toBe(receipt.id);
  expect(Date.parse(data.expiresAt)-Date.parse(data.serverTime)).toBe(20000);
  expect(f.sockets[3].emit).not.toHaveBeenCalled();
  expect(f.db.giftTransaction.count).not.toHaveBeenCalled();
});
