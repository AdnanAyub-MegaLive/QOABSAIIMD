import { randomUUID, createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { requireMobileUser, mobileJson, mobileApiError, mobileOptions } from "@/lib/mobile-api";
import { requireConversationParticipant } from "@/lib/messaging";
import { CHAT_MEDIA_LIMITS, assertChatMediaAccess, chatMediaDTO, chatError, privateChatObject } from "@/lib/chat-media";
import { decodeChatPicture, decodeChatVideo, readChatMultipart } from "@/lib/chat-media-validation";
import { isRateLimited } from "@/lib/rate-limit";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function OPTIONS() { return mobileOptions(); }
export async function GET(request, { params }) {
  try {
    const user = await requireMobileUser(request), { conversationId } = await params;
    const { conversation } = await requireConversationParticipant(conversationId, user.id);
    await assertChatMediaAccess(prisma, conversation, user.id);
    return mobileJson({ success: true, data: { limits: CHAT_MEDIA_LIMITS } });
  } catch (error) { return mobileApiError(error, "CHAT_MEDIA_FAILED"); }
}
let processing = 0;
export async function POST(request, { params }) {
  let row, reserved = false;
  try {
    const user = await requireMobileUser(request), { conversationId } = await params;
    const { conversation } = await requireConversationParticipant(conversationId, user.id);
    await assertChatMediaAccess(prisma, conversation, user.id, true);
    if (isRateLimited(`chat-upload:${user.id}`, { limit: 10, windowMs: 60000 }) || processing >= 2) throw chatError("RATE_LIMITED", "Media processing is busy. Please retry shortly.");
    processing++; reserved = true;
    const form = await readChatMultipart(request);
    const image = form.get("image"), video = form.get("video"), file = image ?? video;
    if (!(file instanceof File) || (image && video) || form.getAll(image ? "image" : "video").length !== 1) throw chatError("VALIDATION_ERROR", "Upload exactly one image or video.");
    const decoded = image ? await decodeChatPicture(Buffer.from(await file.arrayBuffer()), file.type) : await decodeChatVideo(Buffer.from(await file.arrayBuffer()), file.type);
    const key = `private-chat/${randomUUID()}.${image ? "webp" : "mp4"}`, posterKey = decoded.posterBytes ? `private-chat/${randomUUID()}.jpg` : null;
    // Persist cleanup intent before object writes. Failed/abandoned uploads expire automatically.
    row = await prisma.chatMediaObject.create({ data: { conversationId: conversation.id, uploaderId: user.id, key, posterKey, kind: decoded.kind, mimeType: decoded.mimeType, width: decoded.width, height: decoded.height, durationMs: decoded.durationMs, mediaVersion: createHash("sha256").update(decoded.bytes).digest("hex").slice(0, 16), expiresAt: new Date(Date.now() + CHAT_MEDIA_LIMITS.uploadExpiresMs) } });
    await privateChatObject("put", key, { bytes: decoded.bytes, mimeType: decoded.mimeType });
    if (posterKey) await privateChatObject("put", posterKey, { bytes: decoded.posterBytes, mimeType: "image/jpeg" });
    await assertChatMediaAccess(prisma, conversation, user.id, true);
    await prisma.chatMediaObject.update({ where: { id: row.id }, data: { ready: true } });
    return mobileJson({ success: true, data: { media: { ...chatMediaDTO(row, conversationId), kind: row.kind }, limits: CHAT_MEDIA_LIMITS } }, 201);
  } catch (error) {
    if (row) await prisma.chatMediaObject.update({ where: { id: row.id }, data: { expiresAt: new Date() } }).catch(() => {});
    return mobileApiError(error, "CHAT_MEDIA_UPLOAD_FAILED");
  } finally { if (reserved) processing--; }
}
