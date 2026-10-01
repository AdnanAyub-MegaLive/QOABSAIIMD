import { messageSyncLimit, serializeMessage, syncMessagesForUser } from "@/lib/messaging";
import { mobileApiError, requireMobileUser } from "@/lib/mobile-api";
import { requestOrigin, resolveUserPerks } from "@/lib/user-perks";
import { v1Json, v1Options, withV1Request } from "@/lib/mobile-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const path = "/api/v1/conversations/sync";
const methods = "GET, OPTIONS";

export function OPTIONS(request) { return v1Options(request, methods); }
export async function GET(request) {
  return withV1Request(request, { path, methods, rateLimit: { limit: 60, windowMs: 60_000 } }, async ({ requestId }) => {
    try {
      const user = await requireMobileUser(request);
      const url = new URL(request.url);
      const result = await syncMessagesForUser(user.id, {
        cursor: url.searchParams.get("cursor")?.trim() || null,
        limit: messageSyncLimit(url.searchParams.get("limit")),
      });
      const perks = await resolveUserPerks(
        result.records.map((message) => message.sender).filter(Boolean),
        requestOrigin(request),
        ["FRAMES", "BADGES", "CHAT_BOXES"],
      );
      return v1Json(request, requestId, {
        success: true,
        data: {
          messages: result.records.map((message) => ({
            conversationId: message.conversation.publicId,
            message: serializeMessage(message, perks.get(message.sender?.publicId)),
          })),
          nextCursor: result.nextCursor,
          hasMore: result.hasMore,
        },
      }, 200, methods);
    } catch (error) {
      return mobileApiError(error, "MESSAGE_SYNC_FAILED");
    }
  });
}
