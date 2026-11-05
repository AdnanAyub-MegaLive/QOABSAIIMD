import { prisma } from '@/lib/prisma';
import { mobileJson, mobileApiError, requireMobileUser } from '@/lib/mobile-api';
import { isRateLimited } from '@/lib/rate-limit';
import { emitToAudioRoom } from '@/lib/realtime';
import { pkDto, pkError, readPk, invitePk, respondPk, matchmaking } from '@/lib/audio-room-pk';
import { finalizeExpiredPkSessions } from '@/lib/live-maintenance';

async function reply(body, status = 200) {
  const res = await mobileJson(body, status); res.headers.set('Cache-Control', 'private, no-store'); return res;
}
export async function handlePk(request, context, queue = false) {
  try {
    const user = await requireMobileUser(request), { roomId } = await context.params, method = request.method;
    if (isRateLimited(`pk:${user.id}`, { limit: 60, windowMs: 60000 })) pkError('RATE_LIMITED', 'Try again shortly.', 429);
    let body = {};
    if (['POST', 'PATCH', 'DELETE'].includes(method)) { try { body = await request.json(); } catch { pkError('VALIDATION_ERROR', 'Send a valid JSON body.', 422); } }
    const origin = new URL(request.url).origin;
    await finalizeExpiredPkSessions();
    let result;
    if (queue) {
      const key = body?.requestId ?? new URL(request.url).searchParams.get('requestId') ?? request.headers.get('Idempotency-Key');
      result = await matchmaking(prisma, user.id, roomId, method, key, body?.queueId);
    } else if (method === 'GET') {
      const pk = await readPk(prisma, user.id, roomId);
      return reply({ success: true, data: { pk: pk ? pkDto(pk, origin) : null } });
    } else if (method === 'POST') {
      if (typeof body?.opponentRoomId !== 'string' || !body.opponentRoomId.trim()) pkError('VALIDATION_ERROR', 'Provide opponentRoomId.', 422);
      result = await invitePk(prisma, user.id, roomId, body.opponentRoomId.trim());
    } else {
      const action = String(body?.action ?? '').toUpperCase();
      if (typeof body?.pkId !== 'string' || !['ACCEPT', 'REJECT', 'CANCEL', 'END'].includes(action)) pkError('VALIDATION_ERROR', 'Provide pkId and a supported action.', 422);
      result = await respondPk(prisma, user.id, roomId, body.pkId, action);
    }
    const pk = result.pk ? pkDto(result.pk, origin) : null;
    if (result.changed) {
      // A committed operation stays successful even if realtime delivery fails.
      try {
        const event = queue ? 'audio-room:pk-matchmaking' : method === 'PATCH' ? 'audio-room:pk-changed' : 'audio-room:pk-invited';
        await Promise.all([result.pk.leftRoom.roomId, result.pk.rightRoom.roomId].map(id => emitToAudioRoom(id, event, { success: true, data: pk })));
        if (queue) await Promise.all([result.pk.leftRoom.roomId, result.pk.rightRoom.roomId].map(id => emitToAudioRoom(id, 'audio-room:pk-invited', { success: true, data: pk })));
      } catch (error) { console.error('PK realtime delivery failed', { code: error.code }); }
    }
    return reply({ success: true, data: queue ? { state: result.search?.status === 'WAITING' ? 'SEARCHING' : result.search?.status ?? 'IDLE', queueId: result.search?.id ?? null, revision: result.search?.revision ?? 0, requestId: result.search?.requestKey ?? null, expiresAt: result.search?.expiresAt?.toISOString() ?? null, pk } : pk });
  } catch (error) {
    if (error.status) return reply({ success: false, error: { code: error.code, message: error.message } }, error.status);
    return mobileApiError(error, 'PK_REQUEST_FAILED');
  }
}
