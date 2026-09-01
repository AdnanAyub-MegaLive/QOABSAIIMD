import { emitConversationEvent, markMessageDelivered } from "@/lib/messaging";
import { mobileApiError, requireMobileUser } from "@/lib/mobile-api";
import { v1Json, v1Options, withV1Request } from "@/lib/mobile-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const path = "/api/v1/conversations/:conversationId/messages/:messageId/delivered";
const methods = "POST, OPTIONS";

export function OPTIONS(request) { return v1Options(request, methods); }
export async function POST(request, { params }) {
  return withV1Request(request, { path, methods, rateLimit: { limit: 120, windowMs: 60_000 } }, async ({ requestId }) => {
    try {
      const user = await requireMobileUser(request);
      const { conversationId, messageId } = await params;
      const receipt = await markMessageDelivered(
        decodeURIComponent(conversationId),
        decodeURIComponent(messageId),
        user.id,
      );
      const data = { ...receipt, userId: user.publicId };
      await emitConversationEvent(
        globalThis.portalIo,
        receipt.conversationId,
        "message:delivered",
        data,
      );
      return v1Json(request, requestId, { success: true, data }, 200, methods);
    } catch (error) {
      return mobileApiError(error, "MESSAGE_DELIVERY_FAILED");
    }
  });
}
