import { expect, it } from "vitest";
import { comboPresentation, giftComboTiming } from "./gift-combo-timing.js";
const body = { comboId: "combo-1", roomId: "ROOM-1", giftId: "AST-1", recipientId: "USR-2" };
const timing = (value = body, at = 10000, sender = "sender", mode = "PAID") => giftComboTiming(comboPresentation(value, mode, at), sender);
it("extends a single combo deadline per tap, not per gift quantity", () => {
  const a = timing(), b = timing({ ...body, quantity: 50 }, 12000);
  expect(a.id).toBe(b.id);
  expect(a.expiresAt).toBe(new Date(13000).toISOString());
  expect(b.expiresAt).toBe(new Date(15000).toISOString());
  expect(b.windowMs).toBe(3000);
});
it("isolates sender, recipient, room, gift, source and combo", () => {
  const a = timing();
  for (const patch of [{ roomId: "ROOM-2" }, { giftId: "AST-2" }, { recipientId: "USR-3" }, { comboId: "combo-2" }]) expect(timing({ ...body, ...patch }).id).not.toBe(a.id);
  expect(timing(body, 10000, "other").id).not.toBe(a.id);
  expect(timing(body, 10000, "sender", "BACKPACK").id).not.toBe(a.id);
});
it("canonicalizes multi-recipient order and duplicate IDs", () => {
  expect(timing({ ...body, recipientIds: ["B", "A", "B"] }).id).toBe(timing({ ...body, recipientIds: ["A", "B"] }).id);
});
it("does not change legacy, private-chat or live-video presentation", () => {
  for (const patch of [{ comboId: null }, { roomId: null }, { conversationId: "chat" }, { liveId: "live" }]) expect(timing({ ...body, ...patch })).toBeNull();
});
it("rejects malformed combo IDs", () => {
  expect(() => timing({ ...body, comboId: "x".repeat(65) })).toThrow();
});
