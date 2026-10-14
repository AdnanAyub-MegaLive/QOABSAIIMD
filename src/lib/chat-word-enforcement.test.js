import { beforeEach, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({
  chatWordPolicy: { findUnique: vi.fn() },
  conversationParticipant: { findFirst: vi.fn() },
  message: { findFirst: vi.fn(), update: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("./prisma.js", () => ({ prisma: db }));
vi.mock("./user-blocks.js", () => ({ assertConversationMessagingAllowed: vi.fn() }));
import { createMessage, editMessage } from "./messaging.js";

beforeEach(() => {
  vi.clearAllMocks();
  db.chatWordPolicy.findUnique.mockResolvedValue({ words: ["blockedword"] });
  db.conversationParticipant.findFirst.mockResolvedValue({ conversationId: "c1", conversation: { id: "c1", kind: "GROUP" } });
  db.message.findFirst.mockResolvedValue({ id: "m1", senderId: "u1", createdAt: new Date(), deletedAt: null });
});
it.each(["DIRECT", "GROUP", "WORLD"])("rejects %s sends before creating or broadcasting messages", async kind => {
  await expect(createMessage({ id: "c1", kind }, { id: "u1" }, "A blockedword!", {})).rejects.toMatchObject({ code: "INAPPROPRIATE_WORD" });
  expect(db.$transaction).not.toHaveBeenCalled();
});
it("prevents bypassing the list through editing", async () => {
  await expect(editMessage("CONV-1", "MSG-1", "u1", "blockedword")).rejects.toMatchObject({ code: "INAPPROPRIATE_WORD" });
  expect(db.message.update).not.toHaveBeenCalled();
});
it("preserves author permissions before checking text", async () => {
  await expect(editMessage("CONV-1", "MSG-1", "u2", "blockedword")).rejects.toMatchObject({ code: "MESSAGE_EDIT_FORBIDDEN" });
  expect(db.chatWordPolicy.findUnique).not.toHaveBeenCalled();
});
it("allows clean edits", async () => {
  await editMessage("CONV-1", "MSG-1", "u1", "hello");
  expect(db.message.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ body: "hello" }) }));
});
