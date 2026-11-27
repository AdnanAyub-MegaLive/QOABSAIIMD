import { beforeEach, expect, it, vi } from "vitest";
const { emits } = vi.hoisted(() => ({ emits: [] }));
vi.mock("./realtime.js", () => ({ emitToVideoLive: vi.fn(async (liveId, event, payload) => { emits.push({ liveId, event, payload }); }), emitToUser: vi.fn() }));
vi.mock("./user-perks.js", async (load) => ({ ...(await load()), resolveUserPerks: async (users) => new Map(users.map(u => [u.publicId, { frameUrl: `https://cdn.test/${u.publicId}.svga`, frameMimeType: "application/svga" }])) }));
import { coHostAction, coHostRead, scoreCoHostGift, scoreCoHostSafely, maintainCoHosts, requireNoCoHost, coHostDto, leaveCoHostsOnEnd } from "./video-cohost.js";
import { videoPkQueue } from "./video-pk.js";

let lives, sessions, members, pks, seq, admins;
const match = (row, where = {}) => Object.entries(where).every(([k, v]) => {
  if (k === "coHost") { const s = sessions.get(row.coHostId); return s && match(s, v); }
  if (k === "members") return [...members.values()].some(m => m.coHostId === row.id && match(m, v.some));
  if (k === "OR") return v.some(w => match(row, w));
  if (k === "live") return match(lives.get(row.liveId), v);
  if (v && typeof v === "object" && !(v instanceof Date)) {
    if ("in" in v) return v.in.includes(row[k]);
    if ("not" in v) return row[k] !== v.not;
    if ("gt" in v) return row[k] != null && +row[k] > +v.gt;
    if ("gte" in v) return row[k] != null && +row[k] >= +v.gte;
    if ("lte" in v) return row[k] != null && +row[k] <= +v.lte;
    if ("lt" in v) return row[k] != null && +row[k] < +v.lt;
  }
  return row[k] === v;
});
const key = (c, l) => `${c}|${l}`;
const apply = (row, data) => { for (const [k, v] of Object.entries(data)) row[k] = v && typeof v === "object" && "increment" in v ? (typeof row[k] === "bigint" ? row[k] + BigInt(v.increment) : row[k] + v.increment) : v; return row; };
const full = id => { const s = sessions.get(id); if (!s) return null; return { ...s, ownerLive: lives.get(s.ownerLiveId), members: [...members.values()].filter(m => m.coHostId === id).sort((a, b) => a.seq - b.seq).map(m => ({ ...m, live: lives.get(m.liveId) })) }; };
function makeDb() {
  const db = {
    $queryRaw: async () => [],
    userBlock: { findFirst: async () => null }, userFollow: { findUnique: async () => null }, videoLiveInvite: { findUnique: async () => null }, videoLiveAdmin: { findUnique: async ({ where }) => admins.has(`${where.sessionId_userId.sessionId}|${where.sessionId_userId.userId}`) ? {} : null }, videoLiveBan: { findFirst: async () => null },
    videoLivePkSession: { findFirst: async ({ where }) => pks.find(p => match(p, where)) ?? null },
    videoLivePkQueue: { deleteMany: async () => ({}), findMany: async () => [], upsert: async () => ({}) },
    videoLiveSession: { findUnique: async ({ where }) => where.id ? lives.get(where.id) ?? null : [...lives.values()].find(l => l.publicId === where.publicId) ?? null },
    videoCoHostSession: {
      findUnique: async ({ where }) => full(where.id),
      findFirst: async ({ where }) => [...sessions.values()].find(s => match(s, where)) ?? null,
      findMany: async ({ where }) => [...sessions.values()].filter(s => match(s, where)).map(s => full(s.id)),
      create: async ({ data }) => { const { members: m, ...rest } = data; sessions.set(rest.id, { status: "LOBBY", mode: "SOLO", durationSeconds: 300, revision: 0, startedAt: null, endsAt: null, endedAt: null, winnerTeam: null, winnerLiveId: null, ...rest }); await db.videoCoHostMember.create({ data: { coHostId: rest.id, ...m.create } }); return sessions.get(rest.id); },
      update: async ({ where, data }) => apply(sessions.get(where.id), data),
      updateMany: async ({ where, data }) => { const rows = [...sessions.values()].filter(s => match(s, where)); rows.forEach(r => apply(r, data)); return { count: rows.length }; },
    },
    videoCoHostMember: {
      create: async ({ data }) => { const row = { role: "COHOST", status: "INVITED", team: null, score: 0n, inviteExpiresAt: null, joinedAt: null, createdAt: new Date(), seq: seq++, ...data }; members.set(key(row.coHostId, row.liveId), row); return row; },
      findFirst: async ({ where }) => [...members.values()].filter(m => match(m, where)).sort((a, b) => b.seq - a.seq)[0] ?? null,
      findMany: async ({ where }) => [...members.values()].filter(m => match(m, where)),
      update: async ({ where, data }) => apply(members.get(key(where.coHostId_liveId.coHostId, where.coHostId_liveId.liveId)), data),
      updateMany: async ({ where, data }) => { const rows = [...members.values()].filter(m => match(m, where)); rows.forEach(r => apply(r, data)); return { count: rows.length }; },
      upsert: async ({ where, create, update }) => { const k = key(where.coHostId_liveId.coHostId, where.coHostId_liveId.liveId); return members.has(k) ? apply(members.get(k), update) : db.videoCoHostMember.create({ data: create }); },
      delete: async ({ where }) => members.delete(key(where.coHostId_liveId.coHostId, where.coHostId_liveId.liveId)),
      deleteMany: async ({ where }) => { let count = 0; for (const [k, m] of members) if (match(m, where)) { members.delete(k); count++; } return { count }; },
    },
  };
  db.$transaction = work => work(db);
  return db;
}
let db;
const addLive = (n, country = "PK") => lives.set(n, { id: n, publicId: `LIVE-${n}`, hostId: `U${n}`, status: "LIVE", privacyMode: "PUBLIC", hostLastSeenAt: new Date(), host: { id: `U${n}`, publicId: `USR-${n}`, name: `Host ${n}`, profileImage: null, country } });
const user = n => ({ id: `U${n}`, country: lives.get(n).host.country });
const act = (n, action, body = {}) => coHostAction(db, user(n), `LIVE-${n}`, action, body, "https://portal.test");
const err = async p => { try { await p; } catch (e) { return e.code; } return null; };
async function lobby(hosts) {
  const { session } = await act(hosts[0], "create");
  for (const h of hosts.slice(1)) { await act(hosts[0], "invite", { sessionId: session.id, targetLiveId: `LIVE-${h}` }); await act(h, "respond", { sessionId: session.id, action: "ACCEPT" }); }
  return session.id;
}
beforeEach(() => { lives = new Map(); sessions = new Map(); members = new Map(); pks = []; seq = 0; admins = new Set(); emits.length = 0; for (const n of "ABCDEFGHIJ") addLive(n); db = makeDb(); });

it("returns the app envelope with server clock, frames and every member's room getting the event", async () => {
  const id = await lobby(["A", "B"]);
  const res = await act("A", "duration", { sessionId: id, durationSeconds: 900 });
  expect(Object.keys(res).sort()).toEqual(["serverNow", "session"]);
  expect(res.session).toMatchObject({ id, ownerLiveId: "LIVE-A", status: "LOBBY", mode: "SOLO", durationSeconds: 900, startedAt: null, endsAt: null, winnerTeam: null, winnerLiveId: null });
  expect(res.session.members[0]).toEqual({ liveId: "LIVE-A", publicId: "USR-A", name: "Host A", profileImage: null, frameUrl: "https://cdn.test/USR-A.svga", frameMimeType: "application/svga", role: "OWNER", status: "JOINED", team: null, score: "0" });
  const changed = emits.filter(e => e.event === "live-video:cohost-changed").slice(-2);
  expect(changed.map(e => e.liveId).sort()).toEqual(["LIVE-A", "LIVE-B"]);
  expect(changed[0].payload.data).toMatchObject({ liveId: changed[0].liveId, session: { id }, serverNow: expect.any(String) });
});

it("sends the invitee an invite notice and exposes it on GET, country-only", async () => {
  const { session } = await act("A", "create");
  addLive("X", "US");
  expect(await err(act("A", "invite", { sessionId: session.id, targetLiveId: "LIVE-X" }))).toBe("PK_COUNTRY_MISMATCH");
  await act("A", "invite", { sessionId: session.id, targetLiveId: "LIVE-B" });
  const notice = emits.find(e => e.event === "live-video:cohost-invited");
  expect(notice.liveId).toBe("LIVE-B");
  expect(notice.payload.data).toMatchObject({ liveId: "LIVE-B", sessionId: session.id, fromLiveId: "LIVE-A", fromName: "Host A", invite: { sessionId: session.id, fromLiveId: "LIVE-A" } });
  expect(notice.payload.data.session).toBeUndefined();
  const read = await coHostRead(db, user("B"), lives.get("B"), "https://portal.test");
  expect(read.invite).toMatchObject({ sessionId: session.id, fromLiveId: "LIVE-A", fromName: "Host A" });
  expect(read.session).toBeNull();
});

it("caps at 8 including pending invites and lets co-hosts invite", async () => {
  const id = await lobby(["A", "B"]);
  await act("B", "invite", { sessionId: id, targetLiveId: "LIVE-C" });
  for (const n of "DEFGH") await act("A", "invite", { sessionId: id, targetLiveId: `LIVE-${n}` });
  expect(await err(act("A", "invite", { sessionId: id, targetLiveId: "LIVE-I" }))).toBe("COHOST_FULL");
});

it("only the owner sets duration, teams, start and end", async () => {
  const id = await lobby(["A", "B", "C", "D"]);
  for (const [a, b] of [["duration", { durationSeconds: 900 }], ["teams", { blue: ["LIVE-A", "LIVE-B"], red: ["LIVE-C", "LIVE-D"] }], ["start", { mode: "SOLO" }], ["end", {}]]) expect(await err(act("B", a, { sessionId: id, ...b }))).toBe("COHOST_OWNER_REQUIRED");
  expect(await err(act("A", "duration", { sessionId: id, durationSeconds: 120 }))).toBe("VALIDATION_ERROR");
});

it("allows Team only with 4, 6 or 8 equal teams and clears team setup when the count turns odd", async () => {
  const id = await lobby(["A", "B", "C"]);
  expect(await err(act("A", "start", { sessionId: id, mode: "TEAM" }))).toBe("COHOST_TEAM_INVALID");
  await act("A", "invite", { sessionId: id, targetLiveId: "LIVE-D" });
  const joined = await act("D", "respond", { sessionId: id, action: "ACCEPT" });
  expect(joined.session.members.map(m => m.team)).toEqual(["BLUE", "BLUE", "RED", "RED"]);
  expect(await err(act("A", "teams", { sessionId: id, blue: ["LIVE-A"], red: ["LIVE-B", "LIVE-C", "LIVE-D"] }))).toBe("COHOST_TEAM_INVALID");
  const swapped = await act("A", "teams", { sessionId: id, blue: ["LIVE-A", "LIVE-C"], red: ["LIVE-B", "LIVE-D"] });
  expect(swapped.session.members.find(m => m.liveId === "LIVE-C").team).toBe("BLUE");
  const left = await act("C", "leave", { sessionId: id });
  expect(left.session.members.filter(m => m.status === "JOINED").every(m => m.team === null)).toBe(true);
  expect(await err(act("A", "start", { sessionId: id, mode: "TEAM" }))).toBe("COHOST_TEAM_INVALID");
  expect((await act("A", "start", { sessionId: id, mode: "SOLO" })).session.status).toBe("LIVE");
});

it("owner leaving before start closes it for everyone; a co-host leaving only drops them", async () => {
  const id = await lobby(["A", "B", "C"]);
  expect((await act("C", "leave", { sessionId: id })).session).toMatchObject({ status: "LOBBY" });
  const closed = await act("A", "leave", { sessionId: id });
  expect(closed.session.status).toBe("ENDED");
  expect(emits.filter(e => e.event === "live-video:cohost-ended").map(e => e.liveId).sort()).toEqual(["LIVE-A", "LIVE-B", "LIVE-C"]);
  expect(await err(act("B", "duration", { sessionId: id, durationSeconds: 300 }))).toBe("NOT_FOUND");
});

it("locks after start, keeps going when anyone (owner too) leaves, and timer comes from endsAt", async () => {
  const id = await lobby(["A", "B", "C"]);
  await act("A", "invite", { sessionId: id, targetLiveId: "LIVE-D" });
  const started = await act("A", "start", { sessionId: id, mode: "SOLO", durationSeconds: 300 });
  expect(+new Date(started.session.endsAt) - +new Date(started.session.startedAt)).toBe(300000);
  expect(started.session.members.some(m => m.status === "INVITED")).toBe(false);
  expect(emits.filter(e => e.event === "live-video:cohost-started").length).toBe(3);
  expect(await err(act("B", "invite", { sessionId: id, targetLiveId: "LIVE-E" }))).toBe("COHOST_LOCKED");
  expect(await err(act("A", "duration", { sessionId: id, durationSeconds: 900 }))).toBe("COHOST_LOCKED");
  const ownerOut = await act("A", "leave", { sessionId: id });
  expect(ownerOut.session.status).toBe("LIVE");
  expect(ownerOut.session.members.find(m => m.liveId === "LIVE-A").status).toBe("LEFT");
  expect(ownerOut.session.endsAt).toBe(started.session.endsAt);
  expect((await act("B", "leave", { sessionId: id })).session.status).toBe("ENDED");
});

it("disconnect keeps score and rejoin restores the member without resetting the timer", async () => {
  const id = await lobby(["A", "B", "C"]);
  const started = await act("A", "start", { sessionId: id, mode: "SOLO" });
  await scoreCoHostGift(db, lives.get("C"), "UC", 50n);
  const later = new Date(Date.now() + 61_000);
  lives.get("C").hostLastSeenAt = new Date(Date.now() - 120_000);
  members.get(key(id, "C")).joinedAt = new Date(Date.now() - 120_000);
  lives.get("A").hostLastSeenAt = later; lives.get("B").hostLastSeenAt = later;
  await maintainCoHosts(db, later, "https://portal.test");
  expect(members.get(key(id, "C"))).toMatchObject({ status: "DISCONNECTED", score: 50n });
  const back = await act("C", "rejoin", { sessionId: id });
  expect(back.session.members.find(m => m.liveId === "LIVE-C")).toMatchObject({ status: "JOINED", score: "50" });
  expect(back.session.endsAt).toBe(started.session.endsAt);
  expect(await err(act("D", "rejoin", { sessionId: id }))).toBe("COHOST_REJOIN_UNAVAILABLE");
});

it("refuses Co-host and 1v1 PK at the same time in both directions, and a second Co-host", async () => {
  const id = await lobby(["A", "B"]);
  await expect(requireNoCoHost(db, ["B"])).rejects.toMatchObject({ code: "COHOST_ACTIVE" });
  expect(await err(videoPkQueue(db, user("A"), "LIVE-A", { action: "JOIN" }))).toBe("COHOST_ACTIVE");
  expect(await err(act("C", "create").then(r => act("C", "invite", { sessionId: r.session.id, targetLiveId: "LIVE-B" })))).toBe("COHOST_BUSY");
  pks.push({ id: "VPK-1", status: "LIVE", leftSessionId: "E", rightSessionId: "F" });
  expect(await err(act("A", "invite", { sessionId: id, targetLiveId: "LIVE-E" }))).toBe("COHOST_PK_CONFLICT");
  expect(await err(act("F", "create"))).toBe("COHOST_PK_CONFLICT");
});

it("attributes gifts in a member's live to that host and team, then ranks and picks a winner at endsAt", async () => {
  const id = await lobby(["A", "B", "C", "D"]);
  await act("A", "start", { sessionId: id, mode: "TEAM", blue: ["LIVE-A", "LIVE-C"], red: ["LIVE-B", "LIVE-D"] });
  expect(await scoreCoHostGift(db, lives.get("B"), "someone-else", 99n)).toBeNull();
  const s = full(await scoreCoHostGift(db, lives.get("B"), "UB", 30n));
  await scoreCoHostGift(db, lives.get("C"), "UC", 20n);
  const dto = coHostDto(s);
  expect(dto.members.find(m => m.liveId === "LIVE-B").score).toBe("30");
  expect(dto.teams).toEqual([{ team: "BLUE", score: "0" }, { team: "RED", score: "30" }]);
  await maintainCoHosts(db, new Date(Date.now() + 301_000), "https://portal.test");
  const ended = emits.filter(e => e.event === "live-video:cohost-ended");
  expect(ended.length).toBe(4);
  expect(ended[0].payload.data.session).toMatchObject({ status: "ENDED", winnerTeam: "RED", teams: [{ team: "BLUE", score: "20" }, { team: "RED", score: "30" }] });
  expect(ended[0].payload.data.session.ranking.slice(0, 2)).toEqual([{ liveId: "LIVE-B", rank: 1, score: "30" }, { liveId: "LIVE-C", rank: 2, score: "20" }]);
  await maintainCoHosts(db, new Date(Date.now() + 302_000), "https://portal.test");
  expect(emits.filter(e => e.event === "live-video:cohost-ended").length).toBe(4);
  expect(await scoreCoHostGift(db, lives.get("B"), "UB", 5n)).toBeNull();
});

it("Solo winner is the unique top scorer and invites expire after a minute", async () => {
  const id = await lobby(["A", "B"]);
  await act("A", "invite", { sessionId: id, targetLiveId: "LIVE-C" });
  const later = new Date(Date.now() + 61_000);
  lives.get("A").hostLastSeenAt = later; lives.get("B").hostLastSeenAt = later;
  await maintainCoHosts(db, later, "https://portal.test");
  expect(members.has(key(id, "C"))).toBe(false);
  await act("A", "start", { sessionId: id, mode: "SOLO" });
  await scoreCoHostGift(db, lives.get("A"), "UA", 10n);
  const done = await act("A", "end", { sessionId: id });
  expect(done.session).toMatchObject({ status: "ENDED", winnerLiveId: "LIVE-A", winnerTeam: null });
});

it("reports a missing route or kill switch with the codes the app hides on", async () => {
  expect(await err(act("A", "explode"))).toBe("ROUTE_NOT_FOUND");
  process.env.VIDEO_COHOST_ENABLED = "false";
  try { expect(await err(act("A", "create"))).toBe("COHOST_DISABLED"); } finally { delete process.env.VIDEO_COHOST_ENABLED; }
});

it("only scores while the session is LIVE and before endsAt, and a co-host failure never throws into the gift", async () => {
  const id = await lobby(["A", "B"]);
  expect(await scoreCoHostGift(db, lives.get("B"), "UB", 10n)).toBeNull();
  await act("A", "start", { sessionId: id, mode: "SOLO" });
  expect(await scoreCoHostGift(db, lives.get("B"), "UB", 10n)).toBe(id);
  expect(await scoreCoHostGift(db, lives.get("B"), "UB", 10n, new Date(Date.now() + 301_000))).toBeNull();
  expect(members.get(key(id, "B")).score).toBe(10n);
  const raw = [];
  const broken = { ...db, $executeRawUnsafe: async q => { raw.push(q); }, videoCoHostMember: { ...db.videoCoHostMember, updateMany: async () => { throw new Error("boom"); } } };
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  expect(await scoreCoHostSafely(broken, lives.get("B"), "UB", 10n)).toBeNull();
  spy.mockRestore();
  expect(raw).toEqual(["SAVEPOINT cohost_score", "ROLLBACK TO SAVEPOINT cohost_score"]);
});

it("an expired invite is deleted and the error comes after the delete is kept", async () => {
  const id = await lobby(["A"]);
  await act("A", "invite", { sessionId: id, targetLiveId: "LIVE-B" });
  members.get(key(id, "B")).inviteExpiresAt = new Date(Date.now() - 1000);
  let committed = false;
  db.$transaction = async work => { const r = await work(db); committed = true; return r; };
  expect(await err(act("B", "respond", { sessionId: id, action: "ACCEPT" }))).toBe("COHOST_INVITE_EXPIRED");
  expect(committed).toBe(true);
  expect(members.has(key(id, "B"))).toBe(false);
});

it("rejects non-list teams with a validation error", async () => {
  const id = await lobby(["A", "B", "C", "D"]);
  expect(await err(act("A", "teams", { sessionId: id, blue: "LIVE-A", red: ["LIVE-B"] }))).toBe("VALIDATION_ERROR");
  expect(await err(act("A", "start", { sessionId: id, mode: "TEAM", blue: { a: 1 } }))).toBe("VALIDATION_ERROR");
});

it("GET does not finish expired sessions and hides members whose live the caller cannot see", async () => {
  const id = await lobby(["A", "B"]);
  await act("A", "start", { sessionId: id, mode: "SOLO" });
  lives.get("B").privacyMode = "PRIVATE";
  sessions.get(id).endsAt = new Date(Date.now() - 1000);
  lives.set("V", { id: "V", publicId: "LIVE-V", hostId: "UV", status: "LIVE", privacyMode: "PUBLIC", host: { country: "PK" } });
  const read = await coHostRead(db, { id: "UV" }, lives.get("A"), "https://portal.test");
  expect(sessions.get(id).status).toBe("LIVE");
  const hidden = read.session.members.find(m => m.hidden);
  expect(hidden).toMatchObject({ publicId: null, name: null, profileImage: null, frameUrl: null });
  expect(hidden.liveId).not.toBe("LIVE-B");
  expect(JSON.stringify(read.session)).not.toContain("LIVE-B");
  expect(read.session.members.find(m => m.liveId === "LIVE-A").name).toBe("Host A");
});

it("a live admin gets LIVE_MODERATION_FORBIDDEN on co-host actions while others get LIVE_HOST_REQUIRED", async () => {
  admins.add("A|UB");
  expect(await err(coHostAction(db, user("B"), "LIVE-A", "create", {}, "https://portal.test"))).toBe("LIVE_MODERATION_FORBIDDEN");
  expect(await err(coHostAction(db, user("C"), "LIVE-A", "create", {}, "https://portal.test"))).toBe("LIVE_HOST_REQUIRED");
});

it("ending a live leaves its co-host, and the owner ending in LOBBY closes it", async () => {
  const id = await lobby(["A", "B", "C"]);
  expect(await leaveCoHostsOnEnd(db, "C")).toEqual([{ id, event: "cohost-member" }]);
  expect(members.get(key(id, "C")).status).toBe("LEFT");
  expect(await leaveCoHostsOnEnd(db, "A")).toEqual([{ id, event: "cohost-ended" }]);
  expect(sessions.get(id).status).toBe("ENDED");
});
