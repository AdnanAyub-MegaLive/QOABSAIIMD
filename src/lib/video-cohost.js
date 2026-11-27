import { randomUUID } from "node:crypto";
import { videoError, requireVideoAccess } from "./video-access.js";
import { emitToVideoLive, emitToSockets } from "./realtime.js";
import { requireSamePkCountry } from "./video-live.js";
import { resolveUserPerks } from "./user-perks.js";
import { requireLiveOwner } from "./video-moderation.js";

export const COHOST_MAX = 8;
export const COHOST_DURATIONS = [300, 900, 1800];
export const COHOST_INVITE_MS = 60_000;
export const COHOST_DISCONNECT_MS = 60_000;
export const COHOST_ENDED_VISIBLE_MS = 30_000;
const ACTIVE = ["JOINED", "DISCONNECTED"];
const OPEN = ["LOBBY", "LIVE"];
const hostSelect = { id: true, publicId: true, name: true, profileImage: true, country: true };
export const coHostInclude = { ownerLive: { include: { host: { select: hostSelect } } }, members: { include: { live: { include: { host: { select: hostSelect } } } }, orderBy: { createdAt: "asc" } } };

export const coHostEnabled = () => process.env.VIDEO_COHOST_ENABLED !== "false";
export const teamAllowed = n => n === 4 || n === 6 || n === 8;
const inviteLive = (m, now) => m.status === "INVITED" && (!m.inviteExpiresAt || +m.inviteExpiresAt > +now);
export const visibleMembers = (s, now = new Date()) => s.members.filter(m => m.status !== "INVITED" || inviteLive(m, now));
export const activeMembers = s => s.members.filter(m => s.status === "LIVE" ? ACTIVE.includes(m.status) : m.status === "JOINED");
export const seatCount = (s, now = new Date()) => activeMembers(s).length + s.members.filter(m => inviteLive(m, now)).length;
const ordered = list => [...list].sort((a, b) => (a.role === "OWNER" ? 0 : 1) - (b.role === "OWNER" ? 0 : 1) || +(a.joinedAt ?? a.createdAt ?? 0) - +(b.joinedAt ?? b.createdAt ?? 0));
export function defaultTeams(ids) { const half = Math.ceil(ids.length / 2); return { blue: ids.slice(0, half), red: ids.slice(half) }; }
const big = v => BigInt(v ?? 0);

export function coHostRanking(s) {
  const list = s.members.filter(m => m.status !== "INVITED").map((m, i) => ({ m, i })).sort((a, b) => big(b.m.score) > big(a.m.score) ? 1 : big(b.m.score) < big(a.m.score) ? -1 : a.i - b.i);
  let rank = 0, last = null;
  return list.map(({ m }, i) => { if (last === null || big(m.score) !== last) { rank = i + 1; last = big(m.score); } return { liveId: m.live.publicId, rank, score: big(m.score).toString() }; });
}
export function coHostTeamScores(s) {
  const sum = team => s.members.filter(m => m.status !== "INVITED" && m.team === team).reduce((a, m) => a + big(m.score), 0n);
  return [{ team: "BLUE", score: sum("BLUE") }, { team: "RED", score: sum("RED") }];
}
export function coHostWinner(s) {
  if (s.mode === "TEAM") { const [b, r] = coHostTeamScores(s); return { winnerTeam: b.score === r.score ? null : b.score > r.score ? "BLUE" : "RED", winnerLiveId: null }; }
  const ranking = coHostRanking(s);
  return { winnerTeam: null, winnerLiveId: ranking.length && ranking.filter(r => r.rank === 1).length === 1 && big(ranking[0].score) > 0n ? ranking[0].liveId : null };
}

export function coHostDto(s, perks = new Map(), now = new Date()) {
  const members = ordered(visibleMembers(s, now)).map(m => { const h = m.live.host, p = perks.get(h.publicId); return { liveId: m.live.publicId, publicId: h.publicId, name: h.name, profileImage: h.profileImage ?? null, frameUrl: p?.frameUrl ?? null, frameMimeType: p?.frameMimeType ?? null, role: m.role, status: m.status, team: m.team ?? null, score: big(m.score).toString() }; });
  return { id: s.id, ownerLiveId: s.ownerLive.publicId, status: s.status, mode: s.mode, durationSeconds: s.durationSeconds, members, teams: s.mode === "TEAM" ? coHostTeamScores(s).map(t => ({ team: t.team, score: t.score.toString() })) : [], ranking: coHostRanking(s), serverNow: now.toISOString(), startedAt: s.startedAt?.toISOString() ?? null, endsAt: s.endsAt?.toISOString() ?? null, winnerTeam: s.winnerTeam ?? null, winnerLiveId: s.winnerLiveId ?? null, revision: s.revision };
}
export async function coHostView(s, origin, now = new Date()) {
  const hosts = visibleMembers(s, now).map(m => m.live.host);
  const perks = hosts.length ? await resolveUserPerks(hosts, origin, ["FRAMES"]).catch(() => new Map()) : new Map();
  return coHostDto(s, perks, now);
}
export function inviteDto(s, member, from) {
  return { sessionId: s.id, fromLiveId: from?.publicId ?? s.ownerLive.publicId, fromName: from?.host?.name ?? s.ownerLive.host?.name ?? "", fromImage: from?.host?.profileImage ?? s.ownerLive.host?.profileImage ?? null, expiresAt: member.inviteExpiresAt?.toISOString() ?? null };
}

export const loadCoHost = (db, id) => db.videoCoHostSession.findUnique({ where: { id }, include: coHostInclude });
export async function coHostPkBusy(db, liveIds) {
  return db.videoLivePkSession.findFirst({ where: { status: { in: ["PENDING", "LIVE"] }, OR: [{ leftSessionId: { in: liveIds } }, { rightSessionId: { in: liveIds } }] } });
}
export async function coHostBusy(db, liveIds, exceptId = null) {
  return db.videoCoHostMember.findFirst({ where: { liveId: { in: liveIds }, status: { in: ACTIVE }, coHost: { status: { in: OPEN }, ...(exceptId ? { id: { not: exceptId } } : {}) } } });
}
export async function requireNoCoHost(db, liveIds) {
  if (await coHostBusy(db, liveIds)) throw videoError("COHOST_ACTIVE", "Finish your Co-host PK first.", 409);
}
async function requireFree(db, liveIds, exceptId = null) {
  if (await coHostBusy(db, liveIds, exceptId)) throw videoError("COHOST_BUSY", "This host is already in another Co-host.", 409);
  if (await coHostPkBusy(db, liveIds)) throw videoError("COHOST_PK_CONFLICT", "This host is already in a PK.", 409);
}

const lockSession = (tx, id) => tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`video-cohost:${id}`}))::text AS locked`;
const bump = (tx, id, data = {}) => tx.videoCoHostSession.update({ where: { id }, data: { ...data, revision: { increment: 1 } } });
async function retteam(tx, s) {
  const ids = ordered(activeMembers(s)).map(m => m.liveId);
  const { blue, red } = teamAllowed(ids.length) ? defaultTeams(ids) : { blue: [], red: [] };
  for (const m of s.members) { const team = blue.includes(m.liveId) ? "BLUE" : red.includes(m.liveId) ? "RED" : null; if ((m.team ?? null) !== team) { await tx.videoCoHostMember.update({ where: { coHostId_liveId: { coHostId: s.id, liveId: m.liveId } }, data: { team } }); m.team = team; } }
}
const setMember = (s, liveId, data) => { const m = s.members.find(x => x.liveId === liveId); if (m) Object.assign(m, data); return m; };
const memberWhere = (s, liveId) => ({ coHostId_liveId: { coHostId: s.id, liveId } });

export async function finishCoHost(tx, s, now = new Date()) {
  const winner = s.status === "LIVE" ? coHostWinner(s) : { winnerTeam: null, winnerLiveId: null };
  const done = await tx.videoCoHostSession.updateMany({ where: { id: s.id, status: s.status }, data: { status: "ENDED", endedAt: now, ...winner, revision: { increment: 1 } } });
  return done.count > 0;
}
async function leaveMember(tx, s, liveId, now) {
  if (s.status === "LOBBY" && s.ownerLiveId === liveId) { await finishCoHost(tx, s, now); return "cohost-ended"; }
  await tx.videoCoHostMember.update({ where: memberWhere(s, liveId), data: { status: "LEFT", leftAt: now, ...(s.status === "LOBBY" ? { team: null } : {}) } });
  setMember(s, liveId, { status: "LEFT", team: s.status === "LOBBY" ? null : s.members.find(m => m.liveId === liveId)?.team });
  if (s.status === "LIVE" && activeMembers(s).length <= 1) { await finishCoHost(tx, s, now); return "cohost-ended"; }
  if (s.status === "LOBBY") await retteam(tx, s);
  await bump(tx, s.id);
  return "cohost-member";
}

function parseTeams(s, body) {
  if ((body.blue != null && !Array.isArray(body.blue)) || (body.red != null && !Array.isArray(body.red))) throw videoError("VALIDATION_ERROR", "Teams must be lists of live IDs.", 422);
  const ids = activeMembers(s).map(m => m.live.publicId), blue = (body.blue ?? []).map(String), red = (body.red ?? []).map(String), all = new Set([...blue, ...red]);
  if (!teamAllowed(ids.length) || blue.length !== red.length || blue.length + red.length !== ids.length || all.size !== ids.length || ids.some(id => !all.has(id))) throw videoError("COHOST_TEAM_INVALID", "Both teams need the same number of hosts (4, 6 or 8 in total).", 422);
  const byPublic = new Map(s.members.map(m => [m.live.publicId, m.liveId]));
  return { blue: blue.map(id => byPublic.get(id)), red: red.map(id => byPublic.get(id)) };
}
async function applyTeams(tx, s, { blue, red }) {
  for (const m of s.members) { const team = blue.includes(m.liveId) ? "BLUE" : red.includes(m.liveId) ? "RED" : null; await tx.videoCoHostMember.update({ where: memberWhere(s, m.liveId), data: { team } }); m.team = team; }
}
const duration = v => { const d = Number(v); if (!COHOST_DURATIONS.includes(d)) throw videoError("VALIDATION_ERROR", "Choose 5, 15 or 30 minutes.", 422); return d; };

async function session(tx, body) {
  const s = await loadCoHost(tx, String(body.sessionId || ""));
  if (!s || s.status === "ENDED") throw videoError("NOT_FOUND", "This co-host session has ended.", 404);
  return s;
}
const mine = (s, live) => s.members.find(m => m.liveId === live.id);
function requireActive(s, live) { const m = mine(s, live); if (!m || !activeMembers(s).includes(m)) throw videoError("COHOST_MEMBER_REQUIRED", "You are not in this Co-host.", 403); return m; }
function requireOwner(s, live) { const m = requireActive(s, live); if (m.role !== "OWNER" || s.ownerLiveId !== live.id) throw videoError("COHOST_OWNER_REQUIRED", "Only the Co-host owner can do this.", 403); return m; }
function requireLobby(s) { if (s.status !== "LOBBY") throw videoError("COHOST_LOCKED", "The Co-host PK has already started.", 409); }

const actions = {
  async create(tx, { live, body, now }) {
    const own = await tx.videoCoHostSession.findFirst({ where: { ownerLiveId: live.id, status: { in: OPEN }, members: { some: { liveId: live.id, status: { in: ACTIVE } } } } });
    if (own) return { id: own.id };
    await requireFree(tx, [live.id]);
    const id = `VCH-${randomUUID()}`;
    await tx.videoCoHostSession.create({ data: { id, ownerLiveId: live.id, durationSeconds: body.durationSeconds == null ? 300 : duration(body.durationSeconds), members: { create: { liveId: live.id, role: "OWNER", status: "JOINED", joinedAt: now } } } });
    return { id, event: "cohost-changed" };
  },
  async invite(tx, { live, body, now }) {
    const s = await session(tx, body);
    requireLobby(s); requireActive(s, live);
    const target = await tx.videoLiveSession.findUnique({ where: { publicId: String(body.targetLiveId || "") }, include: { host: { select: hostSelect } } });
    if (!target || target.status !== "LIVE" || target.id === live.id || target.hostId === live.hostId) throw videoError("LIVE_NOT_FOUND", "This host is not live right now.", 404);
    requireSamePkCountry(s.ownerLive.host?.country, target.host?.country);
    await requireVideoAccess(tx, target, live.hostId); await requireVideoAccess(tx, live, target.hostId);
    const existing = s.members.find(m => m.liveId === target.id);
    if (existing && (inviteLive(existing, now) || activeMembers(s).includes(existing))) throw videoError("COHOST_ALREADY_INVITED", "This host is already invited.", 409);
    if (seatCount(s, now) >= COHOST_MAX) throw videoError("COHOST_FULL", "Co-host is full (8 hosts max).", 409);
    await requireFree(tx, [target.id], s.id);
    const inviteExpiresAt = new Date(+now + COHOST_INVITE_MS);
    const data = { role: "COHOST", status: "INVITED", team: null, score: 0n, invitedByLiveId: live.id, inviteExpiresAt, joinedAt: null, leftAt: null };
    await tx.videoCoHostMember.upsert({ where: memberWhere(s, target.id), create: { coHostId: s.id, liveId: target.id, ...data }, update: data });
    await bump(tx, s.id);
    return { id: s.id, event: "cohost-changed", invite: { liveId: target.publicId, invite: inviteDto(s, { inviteExpiresAt }, { publicId: live.publicId, host: live.host }) } };
  },
  async respond(tx, { live, body, now }) {
    const s = await session(tx, body), m = mine(s, live);
    if (!m || m.status !== "INVITED") throw videoError("COHOST_INVITE_UNAVAILABLE", "This invite is no longer available.", 409);
    if (!inviteLive(m, now)) { await tx.videoCoHostMember.delete({ where: memberWhere(s, live.id) }); return { id: s.id, error: videoError("COHOST_INVITE_EXPIRED", "This invite has expired.", 409) }; }
    requireLobby(s);
    const answer = String(body.action || "").toUpperCase();
    if (answer === "DECLINE") { await tx.videoCoHostMember.delete({ where: memberWhere(s, live.id) }); await bump(tx, s.id); return { id: s.id, event: "cohost-changed" }; }
    if (answer !== "ACCEPT") throw videoError("VALIDATION_ERROR", "Use ACCEPT or DECLINE.", 422);
    requireSamePkCountry(s.ownerLive.host?.country, live.host?.country);
    await requireFree(tx, [live.id], s.id);
    if (activeMembers(s).length >= COHOST_MAX) throw videoError("COHOST_FULL", "Co-host is full (8 hosts max).", 409);
    await tx.videoCoHostMember.update({ where: memberWhere(s, live.id), data: { status: "JOINED", joinedAt: now, inviteExpiresAt: null } });
    setMember(s, live.id, { status: "JOINED", joinedAt: now });
    await retteam(tx, s); await bump(tx, s.id);
    return { id: s.id, event: "cohost-member" };
  },
  async leave(tx, { live, body, now }) {
    const s = await session(tx, body), m = mine(s, live);
    if (!m) throw videoError("COHOST_MEMBER_REQUIRED", "You are not in this Co-host.", 403);
    if (!activeMembers(s).includes(m)) return { id: s.id };
    return { id: s.id, event: await leaveMember(tx, s, live.id, now) };
  },
  async end(tx, { live, body, now }) {
    const s = await session(tx, body);
    requireOwner(s, live);
    await finishCoHost(tx, s, now);
    return { id: s.id, event: "cohost-ended" };
  },
  async duration(tx, { live, body }) {
    const s = await session(tx, body);
    requireLobby(s); requireOwner(s, live);
    await bump(tx, s.id, { durationSeconds: duration(body.durationSeconds) });
    return { id: s.id, event: "cohost-changed" };
  },
  async teams(tx, { live, body }) {
    const s = await session(tx, body);
    requireLobby(s); requireOwner(s, live);
    await applyTeams(tx, s, parseTeams(s, body)); await bump(tx, s.id);
    return { id: s.id, event: "cohost-changed" };
  },
  async start(tx, { live, body, now }) {
    const s = await session(tx, body);
    requireLobby(s); requireOwner(s, live);
    const mode = String(body.mode || "SOLO").toUpperCase(), active = activeMembers(s);
    if (!["SOLO", "TEAM"].includes(mode)) throw videoError("VALIDATION_ERROR", "Use SOLO or TEAM.", 422);
    if (active.length < 2) throw videoError("COHOST_NOT_ENOUGH", "A Co-host needs at least 2 hosts to start.", 409);
    if (mode === "TEAM" && !teamAllowed(active.length)) throw videoError("COHOST_TEAM_INVALID", `Team PK needs 4, 6 or 8 hosts (now ${active.length}).`, 422);
    const seconds = body.durationSeconds == null ? s.durationSeconds : duration(body.durationSeconds);
    if (mode === "TEAM") {
      const blue = active.filter(m => m.team === "BLUE").map(m => m.liveId), red = active.filter(m => m.team === "RED").map(m => m.liveId);
      await applyTeams(tx, s, body.blue || body.red ? parseTeams(s, body) : blue.length === red.length && blue.length + red.length === active.length ? { blue, red } : defaultTeams(ordered(active).map(m => m.liveId)));
    } else await applyTeams(tx, s, { blue: [], red: [] });
    await tx.videoCoHostMember.deleteMany({ where: { coHostId: s.id, status: "INVITED" } });
    await tx.videoCoHostMember.updateMany({ where: { coHostId: s.id }, data: { score: 0n } });
    await bump(tx, s.id, { status: "LIVE", mode, durationSeconds: seconds, startedAt: now, endsAt: new Date(+now + seconds * 1000) });
    return { id: s.id, event: "cohost-started" };
  },
  async rejoin(tx, { live, body, now }) {
    const s = await session(tx, body), m = mine(s, live);
    if (s.status !== "LIVE" || !m || !ACTIVE.includes(m.status)) throw videoError("COHOST_REJOIN_UNAVAILABLE", "You can only come back into a running Co-host PK you were in.", 409);
    if (s.endsAt && +s.endsAt <= +now) { await finishCoHost(tx, s, now); return { id: s.id, event: "cohost-ended" }; }
    await tx.videoCoHostMember.update({ where: memberWhere(s, live.id), data: { status: "JOINED", joinedAt: now } });
    if (m.status === "JOINED") return { id: s.id };
    await bump(tx, s.id);
    return { id: s.id, event: "cohost-member" };
  },
};
export const COHOST_ACTIONS = Object.keys(actions);

export async function emitCoHost(db, s, event, origin, extra = []) {
  const now = new Date(), dto = await coHostView(s, origin, now), serverNow = now.toISOString();
  const lives = [...new Set([...s.members.map(m => m.live.publicId), ...extra])];
  const io = globalThis.portalIo;
  if (!io) {
    for (const liveId of lives) await emitToVideoLive(liveId, `live-video:${event}`, { success: true, data: { liveId, session: dto, serverNow } });
    return dto;
  }
  const sockets = await io.in(lives.map(id => `live-video:${id}`)).fetchSockets();
  const visibility = await coHostSocketVisibility(db, s, sockets, now);
  // Use socket IDs, not user channels: other devices may be outside this live.
  const deliveries = new Map();
  for (const socket of sockets) {
    const hidden = visibility.get(socket.data?.userId);
    if (!hidden) continue;
    for (const liveId of lives) if (socket.rooms.has(`live-video:${liveId}`)) {
      const key = JSON.stringify([liveId, [...hidden]]);
      if (!deliveries.has(key)) deliveries.set(key, { ids: [], liveId, session: maskHidden(dto, hidden) });
      deliveries.get(key).ids.push(socket.id);
    }
  }
  for (const { ids, liveId, session } of deliveries.values()) {
    await emitToSockets(ids, `live-video:${event}`, { success: true, data: { liveId, session, serverNow } });
  }
  return dto;
}

// Batch access records once per event instead of running access queries per viewer.
export async function coHostSocketVisibility(db, s, sockets, now = new Date()) {
  const publicIds = [...new Set(sockets.map(socket => socket.data?.userId).filter(Boolean))];
  if (!publicIds.length) return new Map();
  const users = await db.user.findMany({ where: { publicId: { in: publicIds } }, select: { id: true, publicId: true } });
  const userIds = users.map(user => user.id), members = visibleMembers(s, now);
  const hostIds = [...new Set(members.map(m => m.live.hostId))], liveIds = members.map(m => m.liveId);
  const [blocks, bans, follows, invites] = await Promise.all([
    db.userBlock.findMany({ where: { OR: [{ blockerId: { in: userIds }, blockedId: { in: hostIds } }, { blockerId: { in: hostIds }, blockedId: { in: userIds } }] }, select: { blockerId: true, blockedId: true } }),
    db.videoLiveBan.findMany({ where: { sessionId: { in: liveIds }, userId: { in: userIds }, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, select: { sessionId: true, userId: true } }),
    db.userFollow.findMany({ where: { followerId: { in: userIds }, followedId: { in: hostIds } }, select: { followerId: true, followedId: true } }),
    db.videoLiveInvite.findMany({ where: { sessionId: { in: liveIds }, userId: { in: userIds } }, select: { sessionId: true, userId: true } }),
  ]);
  const pair = (a, b) => JSON.stringify([a, b]);
  const blocked = new Set(blocks.flatMap(b => [pair(b.blockerId, b.blockedId), pair(b.blockedId, b.blockerId)]));
  const banned = new Set(bans.map(b => pair(b.sessionId, b.userId)));
  const following = new Set(follows.map(f => pair(f.followerId, f.followedId)));
  const invited = new Set(invites.map(i => pair(i.sessionId, i.userId)));
  return new Map(users.map(user => {
    const hidden = members.filter(({ live }) => {
      if (live.hostId === user.id) return false;
      return blocked.has(pair(user.id, live.hostId)) || banned.has(pair(live.id, user.id)) ||
        (live.privacyMode === "FOLLOWERS" && !following.has(pair(user.id, live.hostId))) ||
        (live.privacyMode === "PRIVATE" && !invited.has(pair(live.id, user.id)));
    });
    return [user.publicId, new Set(hidden.map(m => m.live.publicId))];
  }));
}

export async function coHostAction(db, user, liveId, action, body, origin) {
  if (!coHostEnabled()) throw videoError("COHOST_DISABLED", "Co-host isn't available yet.", 404);
  const run = Object.hasOwn(actions, action) ? actions[action] : null;
  if (!run) throw videoError("ROUTE_NOT_FOUND", "Unknown co-host action.", 404);
  const now = new Date();
  const result = await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('video-pk-matching'))::text AS locked`;
    if (body?.sessionId) await lockSession(tx, String(body.sessionId));
    const live = await tx.videoLiveSession.findUnique({ where: { publicId: liveId }, include: { host: { select: hostSelect } } });
    if (!live || live.status !== "LIVE") throw videoError("LIVE_HOST_REQUIRED", "Only a live host can use Co-host.");
    await requireLiveOwner(tx, live, user.id, "Only a live host can use Co-host.");
    return run(tx, { user, live, body: body ?? {}, now });
  }, { timeout: 15000 });
  if (result.error) throw result.error;
  const s = await loadCoHost(db, result.id);
  let dto;
  if (result.event) dto = await emitCoHost(db, s, result.event, origin);
  else dto = await coHostView(s, origin);
  if (result.invite) await emitToVideoLive(result.invite.liveId, "live-video:cohost-invited", { success: true, data: { liveId: result.invite.liveId, invite: result.invite.invite, ...result.invite.invite, serverNow: new Date().toISOString() } });
  return { session: maskHidden(dto, await hiddenLives(db, s, user.id, new Date())), serverNow: dto.serverNow };
}

export async function coHostRead(db, user, live, origin) {
  if (!coHostEnabled()) throw videoError("COHOST_DISABLED", "Co-host isn't available yet.", 404);
  const now = new Date();
  const open = await db.videoCoHostMember.findFirst({ where: { liveId: live.id, status: { in: ACTIVE }, coHost: { status: { in: OPEN } } }, orderBy: { createdAt: "desc" } });
  const recent = open ?? await db.videoCoHostMember.findFirst({ where: { liveId: live.id, status: { not: "INVITED" }, coHost: { status: "ENDED", endedAt: { gte: new Date(+now - COHOST_ENDED_VISIBLE_MS) } } }, orderBy: { createdAt: "desc" } });
  const s = recent ? await loadCoHost(db, recent.coHostId) : null;
  let invite = null;
  if (live.hostId === user.id) {
    const row = await db.videoCoHostMember.findFirst({ where: { liveId: live.id, status: "INVITED", inviteExpiresAt: { gt: now }, coHost: { status: "LOBBY" } }, orderBy: { createdAt: "desc" } });
    if (row) {
      const inv = await loadCoHost(db, row.coHostId);
      const from = row.invitedByLiveId ? await db.videoLiveSession.findUnique({ where: { id: row.invitedByLiveId }, include: { host: { select: hostSelect } } }) : null;
      invite = inviteDto(inv, row, from);
    }
  }
  return { session: s ? maskHidden(await coHostView(s, origin, now), await hiddenLives(db, s, user.id, now)) : null, invite, serverNow: now.toISOString() };
}
async function hiddenLives(db, s, userId, now) {
  const hidden = new Set();
  for (const m of visibleMembers(s, now)) {
    try { await requireVideoAccess(db, m.live, userId); }
    catch (e) { if (e.status && e.status < 500) hidden.add(m.live.publicId); else throw e; }
  }
  return hidden;
}
export function maskHidden(dto, hidden) {
  if (!hidden.size) return dto;
  const key = new Map([...hidden].map((id, i) => [id, `HIDDEN-${i + 1}`]));
  const mask = id => key.get(id) ?? id;
  return { ...dto, ownerLiveId: mask(dto.ownerLiveId), winnerLiveId: dto.winnerLiveId && mask(dto.winnerLiveId), members: dto.members.map(m => hidden.has(m.liveId) ? { ...m, liveId: mask(m.liveId), publicId: null, name: null, profileImage: null, frameUrl: null, frameMimeType: null, hidden: true } : m), ranking: dto.ranking.map(r => ({ ...r, liveId: mask(r.liveId) })) };
}

export async function scoreCoHostGift(tx, live, recipientUserId, coins, now = new Date()) {
  if (!live || recipientUserId !== live.hostId || !(BigInt(coins) > 0n)) return null;
  const member = await tx.videoCoHostMember.findFirst({ where: { liveId: live.id, status: { in: ACTIVE }, coHost: { status: "LIVE", startedAt: { lte: now }, endsAt: { gt: now } } } });
  if (!member) return null;
  // Serialize scoring with finish/start/leave so a winner cannot be computed
  // from a snapshot that predates a concurrently committed gift.
  await lockSession(tx, member.coHostId);
  const scored = await tx.videoCoHostMember.updateMany({ where: { coHostId: member.coHostId, liveId: live.id, status: { in: ACTIVE }, coHost: { status: "LIVE", endsAt: { gt: now } } }, data: { score: { increment: BigInt(coins) } } });
  if (!scored.count) return null;
  await tx.videoCoHostSession.updateMany({ where: { id: member.coHostId, status: "LIVE" }, data: { revision: { increment: 1 } } });
  return member.coHostId;
}
export async function scoreCoHostSafely(tx, live, recipientUserId, coins, now = new Date()) {
  const savepoint = typeof tx.$executeRawUnsafe === "function";
  try {
    if (savepoint) await tx.$executeRawUnsafe("SAVEPOINT cohost_score");
    const id = await scoreCoHostGift(tx, live, recipientUserId, coins, now);
    if (savepoint) await tx.$executeRawUnsafe("RELEASE SAVEPOINT cohost_score");
    return id;
  } catch (error) {
    if (savepoint) await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT cohost_score").catch(() => {});
    console.error("Co-host gift score failed", error?.code ?? error?.name);
    return null;
  }
}

export async function finishExpiredCoHosts(db, now = new Date(), origin) {
  const rows = await db.videoCoHostSession.findMany({ where: { status: "LIVE", endsAt: { lte: now } }, select: { id: true } });
  let ended = 0;
  for (const { id } of rows) {
    const done = await db.$transaction(async tx => {
      await lockSession(tx, id);
      const cur = await loadCoHost(tx, id);
      return !!cur && cur.status === "LIVE" && !!cur.endsAt && +cur.endsAt <= +now && await finishCoHost(tx, cur, now);
    }, { timeout: 15000 });
    if (done) { ended++; await emitCoHost(db, await loadCoHost(db, id), "cohost-ended", origin); }
  }
  return ended;
}

export async function leaveCoHostsOnEnd(tx, liveId, now = new Date()) {
  const rows = await tx.videoCoHostMember.findMany({ where: { liveId, status: { in: ACTIVE }, coHost: { status: { in: OPEN } } }, select: { coHostId: true } });
  const out = [];
  for (const { coHostId } of rows) {
    await lockSession(tx, coHostId);
    const s = await loadCoHost(tx, coHostId), m = s && s.status !== "ENDED" ? s.members.find(x => x.liveId === liveId) : null;
    if (m && activeMembers(s).includes(m)) out.push({ id: coHostId, event: await leaveMember(tx, s, liveId, now) });
  }
  return out;
}
export async function emitCoHostChanges(db, changes, origin = process.env.AUTH_URL || "https://portal.megachat.live") {
  for (const { id, event } of changes) { const s = await loadCoHost(db, id); if (s) await emitCoHost(db, s, s.status === "ENDED" ? "cohost-ended" : event, origin); }
}

export async function maintainCoHosts(db, now = new Date(), origin = process.env.AUTH_URL || "https://portal.megachat.live") {
  if (!coHostEnabled()) return { ended: 0, changed: 0 };
  const ended = await finishExpiredCoHosts(db, now, origin);
  const changed = new Map();
  const expired = await db.videoCoHostMember.findMany({ where: { status: "INVITED", inviteExpiresAt: { lte: now } }, select: { coHostId: true, liveId: true } });
  for (const row of expired) {
    const gone = await db.videoCoHostMember.deleteMany({ where: { coHostId: row.coHostId, liveId: row.liveId, status: "INVITED", inviteExpiresAt: { lte: now } } });
    if (gone.count) changed.set(row.coHostId, "cohost-changed");
  }
  const cutoff = +now - COHOST_DISCONNECT_MS;
  const open = await db.videoCoHostSession.findMany({ where: { status: { in: OPEN }, members: { some: { status: { in: ACTIVE }, live: { OR: [{ status: { not: "LIVE" } }, { hostLastSeenAt: { lt: new Date(cutoff) } }] } } } }, select: { id: true } });
  for (const s of open) {
    const event = await db.$transaction(async tx => {
      await lockSession(tx, s.id);
      const cur = await loadCoHost(tx, s.id);
      if (!cur || cur.status === "ENDED") return null;
      let out = null;
      for (const m of [...activeMembers(cur)].sort((a, b) => (a.role === "OWNER" ? 1 : 0) - (b.role === "OWNER" ? 1 : 0))) {
        if (cur.status === "ENDED") break;
        const gone = m.live.status !== "LIVE";
        const stale = m.status === "JOINED" && cur.status === "LIVE" && m.live.hostLastSeenAt && +m.live.hostLastSeenAt < cutoff && +(m.joinedAt ?? 0) < cutoff;
        if (gone || (cur.status === "LOBBY" && m.live.hostLastSeenAt && +m.live.hostLastSeenAt < cutoff && +(m.joinedAt ?? 0) < cutoff)) {
          out = await leaveMember(tx, cur, m.liveId, now);
          if (out === "cohost-ended") cur.status = "ENDED";
        } else if (stale) {
          await tx.videoCoHostMember.update({ where: memberWhere(cur, m.liveId), data: { status: "DISCONNECTED" } });
          setMember(cur, m.liveId, { status: "DISCONNECTED" });
          await bump(tx, cur.id);
          out = out ?? "cohost-member";
        }
      }
      return out;
    }, { timeout: 15000 });
    if (event) changed.set(s.id, event === "cohost-ended" ? event : changed.get(s.id) === "cohost-ended" ? "cohost-ended" : event);
  }
  for (const [id, event] of changed) { const s = await loadCoHost(db, id); if (s) await emitCoHost(db, s, s.status === "ENDED" ? "cohost-ended" : event, origin); }
  return { ended, changed: changed.size };
}
