import { createGroupConversation, emitConversationEvent, groupConversationWithArtwork } from "@/lib/messaging";
import { requestOrigin } from "@/lib/user-perks";
import { mobileApiError, requireMobileUser } from "@/lib/mobile-api";
import { hasVipPrivilege } from "@/lib/vip-capabilities";
import { v1Json, v1Options, withV1Request } from "@/lib/mobile-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const path = "/api/v1/conversations/groups";
const methods = "POST, OPTIONS";

export function OPTIONS(request) { return v1Options(request, methods); }
export async function POST(request) {
  return withV1Request(request, { path, methods, rateLimit: { limit: 10, windowMs: 60_000 } }, async ({ requestId }) => {
    try {
      const user = await requireMobileUser(request);
      if (!(await hasVipPrivilege(user.id, "GROUP_CHAT"))) throw Object.assign(new Error("Creating group chats is a VIP privilege."), { code: "VIP_PRIVILEGE_REQUIRED", status: 403 });
      const body = await request.json();
      const conversation = await createGroupConversation(user, body?.name, body?.participantIds);
      const data = { conversation: await groupConversationWithArtwork(conversation, requestOrigin(request)) };
      await emitConversationEvent(globalThis.portalIo, conversation.publicId, "conversation:created", data);
      return v1Json(request, requestId, { success: true, data }, 201, methods);
    } catch (error) {
      return mobileApiError(error, "GROUP_CREATE_FAILED");
    }
  });
}
