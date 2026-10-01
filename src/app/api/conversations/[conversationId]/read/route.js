import {
  mobileApiError,
  mobileJson,
  mobileOptions,
  requireMobileUser,
} from "../../../../../lib/mobile-api";
import { emitConversationEvent, markConversationRead, requireConversationParticipant } from "../../../../../lib/messaging";

export function OPTIONS() {
  return mobileOptions();
}

export async function POST(request, { params }) {
  try {
    const user = await requireMobileUser(request);
    const { conversationId } = await params;
    const membership = await requireConversationParticipant(
      decodeURIComponent(conversationId),
      user.id,
    );
    const read = await markConversationRead(membership, user.id);
    const data = { ...read, userId: user.publicId };
    await emitConversationEvent(
      globalThis.portalIo,
      membership.conversation.publicId,
      "conversation:read",
      data,
    );
    return mobileJson({ success: true, data });
  } catch (error) {
    console.error("Conversation read update failed", error);
    return mobileApiError(error, "READ_UPDATE_FAILED");
  }
}
