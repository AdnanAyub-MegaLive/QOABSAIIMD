import { beforeEach, expect, it, vi } from "vitest";
const { db } = vi.hoisted(() => ({ db: {} }));
vi.mock("./prisma.js", () => ({ prisma: db }));
vi.mock("./user-blocks.js", () => ({ assertConversationMessagingAllowed: vi.fn() }));
vi.mock("./chat-word-policy.js", () => ({ assertChatWordsAllowed: async () => {} }));
import { createMessage } from "./messaging.js";
const conversation = { id: "chat", publicId: "CONV-1", kind: "DIRECT" };
let post, shares;
beforeEach(() => {
  const saved = new Map(); shares = new Set();
  post = { publicId: "POST-1", description: "Hello", imageUrl: null, _count: { likes: 0, comments: 0 }, author: { publicId: "USR-a", name: "Author", profileImage: null, blockedUsers: [], blockedByUsers: [] } };
  Object.assign(db, {
    $queryRaw: vi.fn(), $transaction: fn => fn(db),
    conversationParticipant: { findMany: vi.fn(async ({ where }) => where.userId ? [{ userId: "receiver" }] : ["sender", "receiver"].map(userId => ({ conversationId: "chat", userId }))), update: vi.fn() },
    post: { findFirst: vi.fn(async () => ({ id: "post-db" })), findMany: vi.fn(async () => post ? [post] : []), update: vi.fn() },
    postShare: { createMany: vi.fn(async () => { const count = shares.has("sender:post-db") ? 0 : 1; shares.add("sender:post-db"); return { count }; }) },
    message: { findUnique: vi.fn(async ({ where }) => saved.get(where.senderId_clientMessageId.clientMessageId)), create: vi.fn(async ({ data }) => { const record = { ...data, id: "m", sender: { publicId: "USR-s" } }; saved.set(data.clientMessageId, record); return record; }) },
    conversation: { update: vi.fn() }, messageReceipt: { createMany: vi.fn() }, notification: { create: vi.fn() },
  });
});
const send = (options = {}, kind = "DIRECT") => createMessage({ ...conversation, kind }, { id: "sender" }, "", null, { clientMessageId: "request-1", postId: "POST-1", ...options });
it("stores one post message/receipt, not a photo/text pair or notification", async () => {
  const result = await send();
  expect(result).toMatchObject({ type: "post", body: "Shared a post", metadata: { postId: "POST-1" }, post: { available: true, id: "POST-1" } });
  expect(db.message.create.mock.calls[0][0].data).toMatchObject({ kind: "post", metadata: { postId: "POST-1" } });
  expect(db.messageReceipt.createMany).toHaveBeenCalledTimes(1);
  expect(db.notification.create).not.toHaveBeenCalled();
});
it("retries reuse the message but refresh card availability and reject ID reuse", async () => {
  const first = await send();
  post = null;
  expect(await send()).toMatchObject({ id: first.id, post: { id: "POST-1", available: false } });
  expect(db.message.create).toHaveBeenCalledTimes(1);
  await expect(send({ postId: "POST-other" })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
});
it("counts a sender only once even with separate send requests", async () => {
  await send(); await send({ clientMessageId: "request-2" });
  expect(db.message.create).toHaveBeenCalledTimes(2);
  expect(db.post.update).toHaveBeenCalledTimes(1);
});
it("requires an idempotency key and rejects mixed media or non-DMs", async () => {
  for (const options of [{ clientMessageId: null }, { mediaId: "photo" }, { voice: { key: "voice" } }])
    await expect(send(options)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  await expect(send({}, "GROUP")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  expect(db.message.create).not.toHaveBeenCalled();
});
