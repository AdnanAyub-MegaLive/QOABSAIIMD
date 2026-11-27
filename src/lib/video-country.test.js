import { beforeEach, expect, it, vi } from "vitest";
const { db, viewer } = vi.hoisted(() => ({ db: {}, viewer: { id: "viewer", publicId: "USR-viewer", name: "Viewer", country: "PK", isOfficial: true } }));
vi.mock("./prisma.js", () => ({ prisma: db }));
vi.mock("./realtime.js", () => ({ emitToVideoLive: vi.fn(async () => {}), emitToUser: vi.fn() }));
vi.mock("./live-maintenance.js", () => ({ finalizeExpiredPkSessions: async () => {} }));
vi.mock("./mobile-api", () => ({ requireMobileUser: async () => viewer, mobileOptions: () => new Response(null), mobileJson: (body, status = 200) => Response.json(body, { status }), mobileApiError: (e) => Response.json({ success: false, error: { code: e.code } }, { status: e.status ?? 500 }) }));
vi.mock("./user-perks.js", async (load) => ({ ...(await load()), resolveUserPerks: async (users) => new Map(users.map(u => [u.publicId, { frameUrl: "https://cdn.test/frame.svga", frameMimeType: "application/svga", framePosterUrl: "https://cdn.test/frame.png", badgeUrl: "https://cdn.test/badge.png", chatBoxUrl: "https://cdn.test/bubble.png", vipLevel: 3, vipNameColor: "#FFD700", vipTagUrl: "https://cdn.test/vip.png", specialId: "8888", progression: { level: 12, userLevel: 12, charmLevel: 7, anchorLevel: 7, userLevelBackgroundUrl: "https://cdn.test/ul.png", charmLevelBackgroundUrl: "https://cdn.test/cl.png" } }])) }));
import { GET as liveList } from "../app/api/v1/live-video/route.js";
import { POST as invite, PATCH as changePk } from "../app/api/v1/live-video/[liveId]/pk/route.js";
import { videoPkQueue } from "./video-pk.js";
import { liveChatSender, liveCountryWhere } from "./video-live.js";

const params = { params: Promise.resolve({ liveId: "LIVE-L" }) };
const req = (body, method = "POST") => new Request("https://portal.test/api/v1/live-video/LIVE-L/pk", { method, body: JSON.stringify(body) });
const live = (id, hostId, country) => ({ id, publicId: `LIVE-${id}`, hostId, status: "LIVE", privacyMode: "PUBLIC", host: { country } });
let tx;
beforeEach(() => {
  viewer.country = "PK";
  tx = { $queryRaw: async () => [], userBlock: { findFirst: async () => null }, videoLiveBan: { findFirst: async () => null }, videoLivePkSession: { findFirst: vi.fn(async () => null), create: vi.fn(), update: vi.fn() }, videoLivePkQueue: { deleteMany: vi.fn(), findMany: vi.fn(async () => []), upsert: vi.fn() }, videoLiveSession: { findUnique: vi.fn() }, videoCoHostMember: { findFirst: async () => null } };
  db.$transaction = work => work(tx);
});

it("lists only lives whose host shares the viewer's country in every scope", async () => {
  db.videoLiveSession = { findMany: vi.fn(async () => []) };
  for (const scope of ["", "FOLLOWING", "FANS", "POPULAR", "RECENT"]) {
    const res = await liveList(new Request(`https://portal.test/api/v1/live-video?scope=${scope}&country=US`));
    expect(res.status).toBe(200);
    expect(db.videoLiveSession.findMany.mock.lastCall[0].where.AND).toContainEqual({ host: { country: { equals: "PK", mode: "insensitive" } } });
  }
  viewer.country = null;
  await liveList(new Request("https://portal.test/api/v1/live-video"));
  expect(db.videoLiveSession.findMany.mock.lastCall[0].where.AND).toContainEqual({ host: { OR: [{ country: null }, { country: "" }] } });
  expect(liveCountryWhere(" ")).toEqual({ host: { OR: [{ country: null }, { country: "" }] } });
});

it("rejects a cross-country PK invite", async () => {
  tx.videoLiveSession.findUnique.mockImplementation(async ({ where }) => where.publicId === "LIVE-L" ? live("L", viewer.id, "PK") : live("R", "other", "US"));
  const res = await invite(req({ opponentLiveId: "LIVE-R" }), params);
  expect(res.status).toBe(403);
  expect((await res.json()).error.code).toBe("PK_COUNTRY_MISMATCH");
  expect(tx.videoLivePkSession.create).not.toHaveBeenCalled();
});

it("rejects a PK invite between a no-country host and a country host", async () => {
  viewer.country = null;
  tx.videoLiveSession.findUnique.mockImplementation(async ({ where }) => where.publicId === "LIVE-L" ? live("L", viewer.id, null) : live("R", "other", "PK"));
  expect((await (await invite(req({ opponentLiveId: "LIVE-R" }), params)).json()).error.code).toBe("PK_COUNTRY_MISMATCH");
});

it("rejects accepting a cross-country PK invite", async () => {
  tx.videoLiveSession.findUnique.mockResolvedValue(live("L", viewer.id, "PK"));
  tx.videoLivePkSession.findFirst.mockResolvedValue({ id: "VPK-1", status: "PENDING", leftSessionId: "R", rightSessionId: "L", leftSession: live("R", "other", "IN"), rightSession: live("L", viewer.id, "PK") });
  const res = await changePk(req({ pkId: "VPK-1", action: "ACCEPT" }, "PATCH"), params);
  expect((await res.json()).error.code).toBe("PK_COUNTRY_MISMATCH");
  expect(tx.videoLivePkSession.update).not.toHaveBeenCalled();
});

it("random PK never matches hosts from another country", async () => {
  tx.videoLiveSession.findUnique.mockResolvedValue(live("L", viewer.id, "PK"));
  tx.videoLivePkQueue.findMany.mockResolvedValue([{ sessionId: "R", session: live("R", "other", "US") }]);
  expect((await videoPkQueue(db, viewer, "LIVE-L", { action: "JOIN" })).status).toBe("WAITING");
  expect(tx.videoLivePkSession.create).not.toHaveBeenCalled();
});

it("carries the sender's perks on live chat and joined payloads", async () => {
  const sender = await liveChatSender(viewer, "https://portal.test");
  expect(sender).toMatchObject({ publicId: "USR-viewer", name: "Viewer", frameUrl: "https://cdn.test/frame.svga", frameMimeType: "application/svga", framePosterUrl: "https://cdn.test/frame.png", badgeUrl: "https://cdn.test/badge.png", badgeUrls: ["https://cdn.test/badge.png"], chatBoxUrl: "https://cdn.test/bubble.png", level: 12, userLevel: 12, charmLevel: 7, anchorLevel: 7, userLevelBackgroundUrl: "https://cdn.test/ul.png", charmLevelBackgroundUrl: "https://cdn.test/cl.png", vipLevel: 3, vipNameColor: "#FFD700", vipTagUrl: "https://cdn.test/vip.png", specialId: "8888", isOfficial: true });
});

it("a live admin changing PK gets LIVE_MODERATION_FORBIDDEN, other non-hosts LIVE_HOST_REQUIRED", async () => {
  tx.videoLiveSession.findUnique.mockResolvedValue(live("L", "owner", "PK"));
  tx.videoLiveAdmin = { findUnique: vi.fn(async () => ({})) };
  for (const [handler, body] of [[changePk, req({ pkId: "VPK-1", action: "END" }, "PATCH")], [invite, req({ opponentLiveId: "LIVE-R" })]]) expect((await (await handler(body, params)).json()).error.code).toBe("LIVE_MODERATION_FORBIDDEN");
  expect(await videoPkQueue(db, viewer, "LIVE-L", { action: "JOIN" }).catch(e => e.code)).toBe("LIVE_MODERATION_FORBIDDEN");
  tx.videoLiveAdmin.findUnique.mockResolvedValue(null);
  expect((await (await changePk(req({ pkId: "VPK-1", action: "END" }, "PATCH"), params)).json()).error.code).toBe("LIVE_HOST_REQUIRED");
});

it("pkAvailable=1 hides busy hosts and the caller's own live, and flags pkBusy", async () => {
  const rows = ["A", "B", "C", "D", "E"].map(id => ({ ...live(id, `h${id}`, "PK"), host: { id: `h${id}`, publicId: `USR-${id}`, name: id, country: "PK" }, giftIncome: 0n, startedAt: new Date(), revision: 1 }));
  rows[4].hostId = viewer.id;
  db.videoLiveSession = { findMany: vi.fn(async () => rows) };
  db.userBlock = { findFirst: async () => null };
  db.videoLiveBan = { findFirst: async () => null };
  db.videoLivePkSession = { findMany: vi.fn(async ({ where }) => [{ leftSessionId: "A", rightSessionId: "X", status: "PENDING" }, { leftSessionId: "Y", rightSessionId: "B", status: "LIVE" }].filter(p => where.status.in.includes(p.status))) };
  db.videoCoHostMember = { findMany: vi.fn(async ({ where }) => [{ liveId: "C", status: "JOINED", coHost: "LOBBY" }, { liveId: "D", status: "INVITED", coHost: "ENDED" }].filter(m => where.status.in.includes(m.status) && where.coHost.status.in.includes(m.coHost))) };
  const plain = (await (await liveList(new Request("https://portal.test/api/v1/live-video"))).json()).data.sessions;
  expect(plain).toHaveLength(5);
  expect(plain.map(s => s.pkBusy)).toEqual([true, true, true, false, false]);
  const avail = (await (await liveList(new Request("https://portal.test/api/v1/live-video?pkAvailable=1"))).json()).data.sessions;
  expect(avail).toHaveLength(1);
  expect(avail[0].pkBusy).toBe(false);
  expect(db.videoLivePkSession.findMany).toHaveBeenCalledTimes(2);
  expect(db.videoCoHostMember.findMany).toHaveBeenCalledTimes(2);
});

it("pkAvailable=1 treats a Co-host LIVE member as busy", async () => {
  db.userBlock = { findFirst: async () => null };
  db.videoLiveBan = { findFirst: async () => null };
  const rows = ["A", "B"].map(id => ({ ...live(id, `h${id}`, "PK"), host: { id: `h${id}`, publicId: `USR-${id}`, name: id, country: "PK" }, giftIncome: 0n, startedAt: new Date(), revision: 1 }));
  db.videoLiveSession = { findMany: vi.fn(async () => rows) };
  db.videoLivePkSession = { findMany: vi.fn(async () => []) };
  db.videoCoHostMember = { findMany: vi.fn(async () => [{ liveId: "A" }]) };
  const avail = (await (await liveList(new Request("https://portal.test/api/v1/live-video?pkAvailable=1"))).json()).data.sessions;
  expect(avail).toHaveLength(1);
  expect(db.videoCoHostMember.findMany.mock.lastCall[0].where).toMatchObject({ status: { in: ["INVITED", "JOINED", "DISCONNECTED"] }, coHost: { status: { in: ["LOBBY", "LIVE"] } } });
});
