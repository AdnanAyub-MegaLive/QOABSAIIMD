import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ user: null, live: null, admins: new Set(), guests: [], emits: [], userEmits: [], users: {}, removed: [], updates: [] }));
const people = { h: { id: "h", publicId: "P-H", name: "Host" }, a: { id: "a", publicId: "P-A", name: "Admin" }, a2: { id: "a2", publicId: "P-A2", name: "Admin2" }, v: { id: "v", publicId: "P-V", name: "Viewer" }, v2: { id: "v2", publicId: "P-V2", name: "Viewer2" } };
const byPublic = id => Object.values(people).find(p => p.publicId === id) ?? null;
vi.mock("@/lib/prisma", () => ({ prisma: {
  videoLiveSession: { findUnique: async () => m.live, update: async ({ data }) => { m.updates.push(data); return { revision: 2 }; } },
  videoLiveAdmin: {
    findUnique: async ({ where }) => m.admins.has(where.sessionId_userId.userId) ? { userId: where.sessionId_userId.userId } : null,
    findMany: async () => [...m.admins].map(id => ({ user: { ...people[id], profileImage: null } })),
    upsert: async ({ create }) => { m.admins.add(create.userId); },
    deleteMany: async ({ where }) => { m.admins.delete(where.userId); },
  },
  user: { findUnique: async ({ where }) => byPublic(where.publicId) },
  videoLiveViewer: { updateMany: async () => ({}), count: async () => 3 },
  videoLiveGuestRequest: { findMany: async () => m.guests, findFirst: async () => m.guests.find(g => g.status === "APPROVED") ?? null, update: async () => ({}), updateMany: async () => ({}), create: async ({ data }) => ({ ...data, expiresAt: new Date() }) },
  videoLiveBan: { updateMany: async () => ({ count: 1 }), create: async ({ data }) => data, findMany: async () => [], findFirst: async () => null },
  videoLiveReport: { findMany: async () => [{ id: "R1", reporter: null, reason: "x", details: null, status: "OPEN", createdAt: new Date(), resolvedAt: null }] },
  userBlock: { findFirst: async () => null },
} }));
vi.mock("@/lib/mobile-api", () => ({ requireMobileUser: async () => m.user, mobileOptions: () => new Response(null), mobileJson: (b, s = 200) => Response.json(b, { status: s }), mobileApiError: e => Response.json({ success: false, error: { code: e.code ?? e.message } }, { status: e.status ?? 400 }) }));
vi.mock("./user-perks.js", () => ({ requestOrigin: () => "https://portal.test", resolveUserPerks: async () => new Map([["P-A", { frameUrl: "https://f/a.svga", frameMimeType: "application/octet-stream" }]]) }));
vi.mock("@/lib/user-perks", () => ({ requestOrigin: () => "https://portal.test", resolveUserPerks: async () => new Map([["P-A", { frameUrl: "https://f/a.svga", frameMimeType: "application/octet-stream" }]]) }));
vi.mock("./realtime.js", () => ({ emitToVideoLive: async (id, e, p) => m.emits.push([e, p.data]), emitToUser: async (id, e, p) => m.userEmits.push([id, e, p.data]) }));
vi.mock("@/lib/realtime", () => ({ emitToVideoLive: async (id, e, p) => m.emits.push([e, p.data]), emitToUser: async (id, e, p) => m.userEmits.push([id, e, p.data]) }));
vi.mock("./rtc-moderation.js", () => ({ updateRtcPublishPermission: async () => {} }));
vi.mock("@/lib/rtc-moderation", () => ({ updateRtcPublishPermission: async () => {} }));
import { POST, GET } from "@/app/api/v1/live-video/[liveId]/moderation/route.js";
import { POST as requestGuest } from "@/app/api/v1/live-video/[liveId]/guests/route.js";
import { liveModerationInfo, canActOn } from "./video-moderation.js";
const ctx = { params: Promise.resolve({ liveId: "LIVE-1" }) };
const act = async (as, body) => { m.user = people[as]; const res = await POST(new Request("https://portal.test/x", { method: "POST", body: JSON.stringify(body) }), ctx); return { status: res.status, body: await res.json() }; };
beforeEach(() => {
  m.live = { id: "S1", publicId: "LIVE-1", hostId: "h", status: "LIVE", privacyMode: "PUBLIC", chatLocked: false, seatsLocked: false, host: people.h };
  m.admins = new Set(["a", "a2"]); m.guests = []; m.emits = []; m.userEmits = []; m.removed = []; m.updates = [];
  globalThis.portalRemoveFromVideoLive = async (...args) => { m.removed.push(args); };
});

describe("live moderation permissions", () => {
  it("matches the app role matrix", () => {
    expect(canActOn("OWNER", "ADMIN")).toBe(true);
    expect(canActOn("OWNER", "OWNER")).toBe(false);
    expect(canActOn("ADMIN", "VIEWER")).toBe(true);
    expect(canActOn("ADMIN", "ADMIN")).toBe(false);
    expect(canActOn("ADMIN", "OWNER")).toBe(false);
    expect(canActOn("VIEWER", "VIEWER")).toBe(false);
  });
  it("refuses viewers", async () => {
    expect((await act("v", { action: "KICK", userId: "P-V2" })).body.error.code).toBe("LIVE_MODERATION_FORBIDDEN");
    expect((await act("v", { action: "CLEAR_CHAT" })).body.error.code).toBe("LIVE_MODERATION_FORBIDDEN");
  });
  it("refuses admins acting on the host or another admin", async () => {
    expect((await act("a", { action: "KICK", userId: "P-H" })).body.error.code).toBe("LIVE_MODERATION_FORBIDDEN");
    expect((await act("a", { action: "BAN", userId: "P-A2" })).body.error.code).toBe("LIVE_MODERATION_FORBIDDEN");
  });
  it("keeps SET_ADMIN owner-only", async () => {
    expect((await act("a", { action: "SET_ADMIN", userId: "P-V", admin: true })).body.error.code).toBe("LIVE_MODERATION_FORBIDDEN");
    const ok = await act("h", { action: "SET_ADMIN", userId: "P-V", admin: true });
    expect(ok.status).toBe(200);
    expect(m.emits).toContainEqual(["live-video:roles", { liveId: "LIVE-1", adminIds: ["P-A", "P-A2", "P-V"] }]);
    await act("h", { action: "SET_ADMIN", userId: "P-A2", admin: false });
    expect(m.admins.has("a2")).toBe(false);
  });
  it("lets admins kick a viewer and emits kicked", async () => {
    m.guests = [{ id: "G1", status: "APPROVED", userId: "v" }];
    const res = await act("a", { action: "KICK", userId: "P-V" });
    expect(res.status).toBe(200);
    expect(m.removed[0]).toEqual(["P-V", "LIVE-1", { code: "LIVE_KICKED", message: "You were removed from this live." }, "live-video:kicked"]);
    expect(m.emits).toContainEqual(["live-video:kicked", { liveId: "LIVE-1", userId: "P-V" }]);
    expect(m.emits.some(([e]) => e === "live-video:guests-changed")).toBe(true);
  });
  it("lets admins ban a viewer and refuses admin-only targets", async () => {
    const res = await act("a", { action: "BAN", userId: "P-V" });
    expect(res.status).toBe(200);
    expect(m.removed[0][2].code).toBe("LIVE_BANNED");
  });
  it("locks chat and seats and clears chat", async () => {
    await act("a", { action: "LOCK_CHAT", locked: true });
    await act("a", { action: "LOCK_SEATS", locked: false });
    await act("a", { action: "CLEAR_CHAT" });
    expect(m.updates).toContainEqual({ chatLocked: true, revision: { increment: 1 } });
    expect(m.emits).toEqual([["live-video:chat-lock", { liveId: "LIVE-1", locked: true }], ["live-video:seat-lock", { liveId: "LIVE-1", locked: false }], ["live-video:chat-cleared", { liveId: "LIVE-1" }]]);
    expect((await act("a", { action: "LOCK_CHAT" })).body.error.code).toBe("VALIDATION_ERROR");
  });
  it("mutes a guest mic and camera", async () => {
    m.guests = [{ id: "G1", status: "APPROVED", userId: "v" }];
    await act("a", { action: "MUTE_GUEST", userId: "P-V" });
    await act("h", { action: "CAMERA_OFF_GUEST", userId: "P-V" });
    expect(m.emits).toEqual([["live-video:guest-muted", { liveId: "LIVE-1", userId: "P-V", mic: true, camera: false }], ["live-video:guest-muted", { liveId: "LIVE-1", userId: "P-V", mic: false, camera: true }]]);
    m.guests = [];
    expect((await act("a", { action: "MUTE_GUEST", userId: "P-V" })).body.error.code).toBe("GUEST_REQUEST_UNAVAILABLE");
  });
  it("lets admins read the list without reports", async () => {
    m.user = people.a; m.live.chatLocked = true;
    const data = (await (await GET(new Request("https://portal.test/x"), ctx)).json()).data;
    expect(data).toMatchObject({ bans: [], reports: [], adminIds: ["P-A", "P-A2"], chatLocked: true, seatsLocked: false });
    m.user = people.v;
    expect((await (await GET(new Request("https://portal.test/x"), ctx)).json()).error.code).toBe("LIVE_MODERATION_FORBIDDEN");
  });
});

describe("live moderation detail and seat lock", () => {
  it("builds the detail moderation payload", async () => {
    m.live.seatsLocked = true;
    const { prisma } = await import("@/lib/prisma");
    expect(await liveModerationInfo(prisma, m.live, "a", "https://portal.test")).toEqual({ adminIds: ["P-A", "P-A2"], admins: [{ publicId: "P-A", name: "Admin", profileImage: null, frameUrl: "https://f/a.svga", frameMimeType: "application/octet-stream" }, { publicId: "P-A2", name: "Admin2", profileImage: null, frameUrl: null, frameMimeType: null }], chatLocked: false, seatsLocked: true, myRole: "ADMIN" });
    expect((await liveModerationInfo(prisma, m.live, "h", "o")).myRole).toBe("OWNER");
    expect((await liveModerationInfo(prisma, m.live, "v", "o")).myRole).toBe("VIEWER");
  });
  it("refuses viewer guest requests while seats are locked", async () => {
    m.live.seatsLocked = true; m.user = people.v;
    const res = await requestGuest(new Request("https://portal.test/x", { method: "POST" }), ctx);
    expect((await res.json()).error.code).toBe("LIVE_SEATS_LOCKED");
    m.user = people.a;
    expect((await requestGuest(new Request("https://portal.test/x", { method: "POST" }), ctx)).status).toBe(201);
  });
});
