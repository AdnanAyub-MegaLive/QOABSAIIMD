import { emitConversationEvent, removeGroupMember, serializeGroupConversation } from "@/lib/messaging";
import { mobileApiError, requireMobileUser } from "@/lib/mobile-api";
import { v1Json, v1Options, withV1Request } from "@/lib/mobile-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const path = "/api/v1/conversations/:conversationId/members/:userId";
const methods = "DELETE, OPTIONS";

export function OPTIONS(request) { return v1Options(request, methods); }
export async function DELETE(request, { params }) {
  return withV1Request(request, { path, methods, rateLimit: { limit: 30, windowMs: 60_000 } }, async ({ requestId }) => {
    try {
      const user = await requireMobileUser(request);
      const { conversationId, userId } = await params;
      const conversation = await removeGroupMember(
        decodeURIComponent(conversationId),
        user.id,
        decodeURIComponent(userId),
      );
      const data = { conversation: serializeGroupConversation(conversation) };
      await emitConversationEvent(globalThis.portalIo, conversation.publicId, "conversation:updated", data);
      return v1Json(request, requestId, { success: true, data }, 200, methods);
    } catch (error) {
      return mobileApiError(error, "GROUP_MEMBER_REMOVE_FAILED");
    }
  });
}
