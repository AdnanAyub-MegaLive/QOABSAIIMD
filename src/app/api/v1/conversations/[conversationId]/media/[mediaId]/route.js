import { prisma } from "@/lib/prisma";
import { requireMobileUser, mobileApiError, mobileOptions } from "@/lib/mobile-api";
import { requireConversationParticipant } from "@/lib/messaging";
import { authorizeChatMediaRead, privateChatObject, chatError } from "@/lib/chat-media";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function OPTIONS() { return mobileOptions(); }
export async function GET(request, { params }) {
  try {
    const user = await requireMobileUser(request), { conversationId, mediaId } = await params;
    const { conversation } = await requireConversationParticipant(conversationId, user.id);
    const row = await prisma.chatMediaObject.findUnique({ where: { id: mediaId } });
    await authorizeChatMediaRead(prisma, row, conversation, user.id);
    const poster = new URL(request.url).searchParams.get("poster") === "1";
    if (poster && !row.posterKey) throw chatError("MESSAGE_NOT_FOUND", "Poster not found.");
    const range = request.headers.get("range");
    if (range && !/^bytes=(?:\d+-\d*|-\d+)$/.test(range)) return new Response(null, { status: 416, headers: { "Cache-Control": "private, no-store" } });
    const result = await privateChatObject("get", poster ? row.posterKey : row.key, { range });
    const headers = { "Content-Type": poster ? "image/jpeg" : row.mimeType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Accept-Ranges": "bytes", "Vary": "Authorization", "Content-Length": String(result.ContentLength) };
    if (result.ContentRange) headers["Content-Range"] = result.ContentRange;
    return new Response(result.Body.transformToWebStream(), { status: result.ContentRange ? 206 : 200, headers });
  } catch (error) {
    if (error.name === "InvalidRange") return new Response(null, { status: 416, headers: { "Cache-Control": "private, no-store" } });
    if (error.name === "NoSuchKey") error = chatError("MESSAGE_NOT_FOUND", "Media not found.");
    return mobileApiError(error, "CHAT_MEDIA_READ_FAILED");
  }
}
