import crypto from 'node:crypto';
import { roomCoverDto } from './room-cover.js';
const include = { leftRoom: true, rightRoom: true };
const active = ['PENDING', 'LIVE'];
export function pkError(code, message, status = 409) { throw Object.assign(new Error(message), { code, status }); }
export function pkDto(p, origin) {
  const room = r => ({ roomId: r.roomId, title: r.title, coverImageUrl: roomCoverDto(r, origin).coverImageUrl });
  return { id: p.id, status: p.status, leftRoomId: p.leftRoom.roomId, rightRoomId: p.rightRoom.roomId,
    leftRoom: room(p.leftRoom), rightRoom: room(p.rightRoom), leftScore: p.leftScore.toString(), rightScore: p.rightScore.toString(),
    revision: p.revision, startedAt: p.startedAt?.toISOString() ?? null, endsAt: p.endsAt?.toISOString() ?? null,
    endedAt: p.endedAt?.toISOString() ?? null, winnerRoomId: p.winnerRoomId };
}
export function pkTransition(p, roomId, action, now = new Date()) {
  if (action === 'ACCEPT' && p.status === 'PENDING' && p.rightRoomId === roomId)
    return { status: 'LIVE', startedAt: now, endsAt: new Date(+now + 300000) };
  if (action === 'REJECT' && p.status === 'PENDING' && p.rightRoomId === roomId) return { status: 'REJECTED', endedAt: now };
  if ((action === 'CANCEL' || action === 'END') && p.status === 'PENDING' && p.leftRoomId === roomId)
    return { status: 'ENDED', endedAt: now, winnerRoomId: null };
  if (action === 'END' && p.status === 'LIVE' && [p.leftRoomId, p.rightRoomId].includes(roomId))
    return { status: 'ENDED', endedAt: now, winnerRoomId: p.leftScore === p.rightScore ? null : p.leftScore > p.rightScore ? p.leftRoom.roomId : p.rightRoom.roomId };
  pkError('PK_STATE_INVALID', 'This action is not available for this owner and battle state.');
}
const conflict = (tx, ids) => tx.audioRoomPkSession.findFirst({ where: { status: { in: active }, OR: [{ leftRoomId: { in: ids } }, { rightRoomId: { in: ids } }] }, include });
export async function pkRoom(tx, publicId, userId, owner = false) {
  const room = await tx.audioRoom.findUnique({ where: { roomId: publicId } });
  if (!room || room.status !== 'LIVE' || room.isBlocked || (room.terminatedUntil && room.terminatedUntil > new Date())) pkError('ROOM_UNAVAILABLE', 'Room is not available.', 404);
  if (owner && room.ownerId !== userId) pkError('ROOM_OWNER_REQUIRED', 'Only the room owner can manage PK.', 403);
  const member = await tx.audioRoomMember.findUnique({ where: { audioRoomId_userId: { audioRoomId: room.id, userId } } });
  if (!member || member.socketCount < 1) pkError('ROOM_MEMBERSHIP_REQUIRED', 'Join this room first.', 403);
  const ban = await tx.audioRoomBan.findFirst({ where: { audioRoomId: room.id, userId, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } });
  if (ban) pkError('ROOM_BANNED', 'You cannot access this room.', 403);
  return room;
}
async function eligible(tx, room) {
  if (!room || room.privacyMode !== 'PUBLIC' || room.passwordHash || room.joiningDisabled || (room.paidEntryCoins ?? 0n) > 0n) return false;
  try { await pkRoom(tx, room.roomId, room.ownerId, true); } catch (error) { if (error.status) return false; throw error; }
  const owner = await tx.user.findUnique({ where: { id: room.ownerId }, select: { status: true, deletedAt: true } });
  return owner?.status === 'ACTIVE' && !owner.deletedAt;
}
async function blocked(tx, a, b) {
  return !!await tx.userBlock.findFirst({ where: { OR: [{ blockerId: a.ownerId, blockedId: b.ownerId }, { blockerId: b.ownerId, blockedId: a.ownerId }] } });
}
// Shared by direct invitations and queue operations, across all server processes.
async function locked(db, fn) {
  return db.$transaction(async tx => { await tx.$queryRaw`SELECT pg_advisory_xact_lock(2030152)::text`; return fn(tx); }, { isolationLevel: 'ReadCommitted', timeout: 10000 });
}
async function createBattle(tx, left, right) {
  await tx.audioRoomPkSearch.updateMany({ where: { roomId: { in: [left.roomId, right.roomId] }, status: 'WAITING' }, data: { status: 'CANCELLED' } });
  return tx.audioRoomPkSession.create({ data: { id: `PK-${crypto.randomUUID()}`, leftRoomId: left.id, rightRoomId: right.id }, include });
}
export async function invitePk(db, userId, roomId, opponentRoomId) {
  return locked(db, async tx => {
    const left = await pkRoom(tx, roomId, userId, true), right = await tx.audioRoom.findUnique({ where: { roomId: opponentRoomId } });
    if (!await eligible(tx, left) || !await eligible(tx, right) || left.id === right.id || await blocked(tx, left, right)) pkError('ROOM_UNAVAILABLE', 'Opponent room is not available.', 404);
    const existing = await conflict(tx, [left.id, right.id]);
    if (existing) {
      if (existing.leftRoomId === left.id && existing.rightRoomId === right.id) return { pk: existing, changed: false };
      pkError('PK_CONFLICT', 'One of these rooms is already in PK.');
    }
    return { pk: await createBattle(tx, left, right), changed: true };
  });
}
export async function respondPk(db, userId, roomId, pkId, action) {
  return locked(db, async tx => {
    const room = await pkRoom(tx, roomId, userId, true);
    await tx.$queryRaw`SELECT id FROM "AudioRoomPkSession" WHERE id=${pkId} FOR UPDATE`;
    const p = await tx.audioRoomPkSession.findUnique({ where: { id: pkId }, include });
    if (!p || ![p.leftRoomId, p.rightRoomId].includes(room.id)) pkError('PK_NOT_FOUND', 'Battle not found.', 404);
    if (action === 'ACCEPT' && p.status === 'LIVE' && p.rightRoomId === room.id) return { pk: p, changed: false };
    if (['ENDED', 'REJECTED'].includes(p.status)) return { pk: p, changed: false };
    if (action === 'ACCEPT' && (!await eligible(tx, p.leftRoom) || !await eligible(tx, p.rightRoom) || await blocked(tx, p.leftRoom, p.rightRoom))) pkError('ROOM_UNAVAILABLE', 'Both owners must be in eligible rooms.', 409);
    const data = pkTransition(p, room.id, action);
    return { pk: await tx.audioRoomPkSession.update({ where: { id: p.id }, data: { ...data, revision: { increment: 1 } }, include }), changed: true };
  });
}
export async function matchmaking(db, userId, roomId, method, requestKey, queueId) {
  if (method !== 'GET' && (typeof requestKey !== 'string' || !/^[\w-]{8,128}$/.test(requestKey))) pkError('VALIDATION_ERROR', 'Provide an 8–128 character requestId.', 422);
  if (method === 'DELETE' && (typeof queueId !== 'string' || !queueId)) pkError('VALIDATION_ERROR', 'Provide queueId from your search.', 422);
  return locked(db, async tx => {
    const room = await pkRoom(tx, roomId, userId, true), now = new Date();
    await tx.audioRoomPkSearch.updateMany({ where: { status: 'WAITING', expiresAt: { lte: now } }, data: { status: 'EXPIRED' } });
    let search = requestKey ? await tx.audioRoomPkSearch.findUnique({ where: { ownerId_requestKey: { ownerId: userId, requestKey } } })
      : await tx.audioRoomPkSearch.findFirst({ where: { ownerId: userId, roomId }, orderBy: { createdAt: 'desc' } });
    if (search && search.roomId !== roomId) pkError('IDEMPOTENCY_CONFLICT', 'This request belongs to a different room.');
    if (method === 'DELETE' && search && search.id !== queueId) pkError('IDEMPOTENCY_CONFLICT', 'The queue and request ID do not match.');
    if (method === 'DELETE') {
      if (!search) search = await tx.audioRoomPkSearch.create({ data: { ownerId: userId, roomId, requestKey, status: 'CANCELLED', expiresAt: now } });
      else if (search.status === 'WAITING') search = await tx.audioRoomPkSearch.update({ where: { id: search.id }, data: { status: 'CANCELLED' } });
    }
    if (!search && method === 'POST') {
      if (!await eligible(tx, room)) pkError('ROOM_UNAVAILABLE', 'Random PK requires a public, free, unlocked room.', 409);
      if (await conflict(tx, [room.id])) pkError('PK_CONFLICT', 'This room already has a battle.');
      search = await tx.audioRoomPkSearch.findFirst({ where: { roomId, status: 'WAITING' } });
      if (search && search.requestKey !== requestKey) pkError('PK_SEARCH_ACTIVE', 'A search is already running. Read its status first.');
      if (!search) search = await tx.audioRoomPkSearch.create({ data: { roomId, ownerId: userId, requestKey, expiresAt: new Date(+now + 60000) } });
    }
    let created = null;
    if (search?.status === 'WAITING') {
      if (!await eligible(tx, room) || await conflict(tx, [room.id])) search = await tx.audioRoomPkSearch.update({ where: { id: search.id }, data: { status: 'CANCELLED' } });
      else {
        const candidates = await tx.audioRoomPkSearch.findMany({ where: { status: 'WAITING', roomId: { not: roomId }, expiresAt: { gt: now } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 50 });
        for (const candidate of candidates) {
          const other = await tx.audioRoom.findUnique({ where: { roomId: candidate.roomId } });
          if (!await eligible(tx, other) || other.ownerId !== candidate.ownerId || await conflict(tx, [other.id])) {
            await tx.audioRoomPkSearch.update({ where: { id: candidate.id }, data: { status: 'CANCELLED' } }); continue;
          }
          if (await blocked(tx, room, other)) continue;
          created = await createBattle(tx, other, room);
          await tx.audioRoomPkSearch.updateMany({ where: { id: { in: [search.id, candidate.id] } }, data: { status: 'MATCHED', pkId: created.id } });
          search = { ...search, status: 'MATCHED', pkId: created.id }; break;
        }
      }
    }
    const pk = created ?? (search?.pkId ? await tx.audioRoomPkSession.findUnique({ where: { id: search.pkId }, include }) : null);
    if (method === 'GET' && search?.status === 'MATCHED' && (!pk || !active.includes(pk.status))) return { search: null, pk: null, changed: false };
    return { search, pk, changed: !!created };
  });
}
