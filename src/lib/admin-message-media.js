import { prisma } from "./prisma.js";
import { requirePermission } from "./portal-admin.js";
import { voiceObject } from "./voice-storage.js";
import { privateChatObject } from "./chat-media.js";

const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", Vary: "Cookie" };

export async function adminMessageMedia(request, context, mode) {
  try {
    const admin = await requirePermission("messages.view");
    const { messagePublicId } = await context.params;
    // Deleted messages remain inspectable only while their private file exists.
    const message = await prisma.message.findUnique({ where: { publicId: messagePublicId }, select: {
      publicId: true, kind: true, voiceKey: true, voiceMimeType: true,
      mediaId: true, conversationId: true, deletedAt: true,
    } });
    if (!message) return new Response(null, { status: 404, headers: privateHeaders });
    let key, mimeType, poster = false;
    if (mode === "voice") {
      if (message.kind !== "voice" || !message.voiceKey) return new Response(null, { status: 404, headers: privateHeaders });
      key = message.voiceKey; mimeType = "audio/mp4";
    } else {
      if (!["picture", "video"].includes(message.kind) || !message.mediaId) return new Response(null, { status: 404, headers: privateHeaders });
      const media = await prisma.chatMediaObject.findUnique({ where: { id: message.mediaId } });
      if (!media?.ready || media.conversationId !== message.conversationId) return new Response(null, { status: 404, headers: privateHeaders });
      poster = new URL(request.url).searchParams.get("poster") === "1";
      key = poster ? media.posterKey : media.key;
      mimeType = poster ? "image/jpeg" : media.mimeType;
      if (!key || !["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4"].includes(mimeType))
        return new Response(null, { status: 404, headers: privateHeaders });
    }
    const range = request.headers.get("range");
    if (range && !/^bytes=(?:\d+-\d*|-\d+)$/.test(range)) return new Response(null, { status: 416, headers: privateHeaders });
    // Fail closed if audit storage is unavailable; never log storage keys.
    await prisma.auditLog.create({ data: {
      adminId: admin.id, action: "MESSAGE_MEDIA_VIEWED", category: "MESSAGES",
      entityType: "Message", entityId: message.publicId,
      description: `Viewed chat ${poster ? "video poster" : mode === "voice" ? "voice note" : message.kind}.`,
      metadata: { deleted: Boolean(message.deletedAt), range: range ?? null },
    } });
    const result = mode === "voice" ? await voiceObject("get", key) : await privateChatObject("get", key, { range });
    const headers = { ...privateHeaders, "Content-Type": mimeType, "Content-Disposition": "inline" };
    if (mode !== "voice") headers["Accept-Ranges"] = "bytes";
    if (result.ContentLength != null) headers["Content-Length"] = String(result.ContentLength);
    if (result.ContentRange) headers["Content-Range"] = result.ContentRange;
    return new Response(result.Body.transformToWebStream(), { status: result.ContentRange ? 206 : 200, headers });
  } catch (error) {
    const status = [401, 403].includes(error.status) ? error.status : error.name === "InvalidRange" ? 416 : ["NoSuchKey", "NotFound"].includes(error.name) ? 404 : 500;
    if (status === 500) console.error("Admin message media failed", { name: error.name, code: error.code });
    return Response.json({ error: { message: status === 500 ? "Unable to load message media." : status === 404 ? "Media is no longer available." : status === 416 ? "Invalid media range." : "Access denied." } }, { status, headers: privateHeaders });
  }
}
