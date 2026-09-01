import { deleteMessage, editMessage, emitConversationEvent, serializeMessage } from "@/lib/messaging";
import { mobileApiError, requireMobileUser } from "@/lib/mobile-api";
import { requestOrigin, resolveUserPerks } from "@/lib/user-perks";
import { v1Json, v1Options, withV1Request } from "@/lib/mobile-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const path = "/api/v1/conversations/:conversationId/messages/:messageId";
const methods = "PATCH, DELETE, OPTIONS";

export function OPTIONS(request) { return v1Options(request, methods); }

async function serializedMessage(record, request) {
  const perks = await resolveUserPerks(
    record.sender ? [record.sender] : [],
    requestOrigin(request),
    ["FRAMES", "BADGES", "CHAT_BOXES"],
  );
  return serializeMessage(record, perks.get(record.sender?.publicId));
}

export async function PATCH(request, { params }) {
  return withV1Request(request, { path, methods, rateLimit: { limit: 30, windowMs: 60_000 } }, async ({ requestId }) => {
    try {
      const user = await requireMobileUser(request);
      const body = await request.json();
      const { conversationId, messageId } = await params;
      const record = await editMessage(
        decodeURIComponent(conversationId),
        decodeURIComponent(messageId),
        user.id,
        body?.body,
      );
      const data = {
        conversationId: decodeURIComponent(conversationId),
        message: await serializedMessage(record, request),
      };
      await emitConversationEvent(globalThis.portalIo, data.conversationId, "message:updated", data);
      return v1Json(request, requestId, { success: true, data }, 200, methods);
    } catch (error) {
      return mobileApiError(error, "MESSAGE_EDIT_FAILED");
    }
  });
}

export async function DELETE(request, { params }) {
  return withV1Request(request, { path, methods, rateLimit: { limit: 30, windowMs: 60_000 } }, async ({ requestId }) => {
    try {
      const user = await requireMobileUser(request);
      const { conversationId, messageId } = await params;
      const record = await deleteMessage(
        decodeURIComponent(conversationId),
        decodeURIComponent(messageId),
        user.id,
      );
      const data = {
        conversationId: decodeURIComponent(conversationId),
        message: await serializedMessage(record, request),
      };
      await emitConversationEvent(globalThis.portalIo, data.conversationId, "message:deleted", data);
      return v1Json(request, requestId, { success: true, data }, 200, methods);
    } catch (error) {
      return mobileApiError(error, "MESSAGE_DELETE_FAILED");
    }
  });
}
