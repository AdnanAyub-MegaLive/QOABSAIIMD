import { addGroupMember, emitConversationEvent, serializeGroupConversation } from "@/lib/messaging";
import { mobileApiError, requireMobileUser } from "@/lib/mobile-api";
import { v1Json, v1Options, withV1Request } from "@/lib/mobile-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const path = "/api/v1/conversations/:conversationId/members";
const methods = "POST, OPTIONS";

export function OPTIONS(request) { return v1Options(request, methods); }
export async function POST(request, { params }) {
  return withV1Request(request, { path, methods, rateLimit: { limit: 30, windowMs: 60_000 } }, async ({ requestId }) => {
    try {
      const user = await requireMobileUser(request);
      const body = await request.json();
      const { conversationId } = await params;
      const conversation = await addGroupMember(
        decodeURIComponent(conversationId),
        user.id,
        String(body?.targetUserId ?? "").trim(),
      );
      const data = { conversation: serializeGroupConversation(conversation) };
      await emitConversationEvent(globalThis.portalIo, conversation.publicId, "conversation:updated", data);
      return v1Json(request, requestId, { success: true, data }, 201, methods);
    } catch (error) {
      return mobileApiError(error, "GROUP_MEMBER_ADD_FAILED");
    }
  });
}
