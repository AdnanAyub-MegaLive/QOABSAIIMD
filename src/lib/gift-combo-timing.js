import { createHash } from "node:crypto";
import { parseGiftBatchId } from "./gift-batch.js";

// Presentation only. Never use this identifier to settle or deduplicate charges.
export const GIFT_COMBO_WINDOW_MS = 3000;
export function comboPresentation(body, mode, receivedAt = Date.now()) {
  const comboId = parseGiftBatchId(body?.comboId);
  if (!comboId || !body?.roomId || body.liveId || body.conversationId) return null;
  return {
    comboId, mode, roomId: body.roomId, giftId: body.giftId,
    recipients: [...new Set(body.recipientIds ?? [body.recipientId])].sort(),
    receivedAt,
  };
}
export function giftComboTiming(presentation, senderId) {
  if (!presentation) return null;
  const { receivedAt, ...scope } = presentation;
  return {
    id: createHash("sha256").update(JSON.stringify([senderId, scope])).digest("hex"),
    comboId: presentation.comboId,
    windowMs: GIFT_COMBO_WINDOW_MS,
    receivedAt: new Date(receivedAt).toISOString(),
    expiresAt: new Date(receivedAt + GIFT_COMBO_WINDOW_MS).toISOString(),
  };
}
