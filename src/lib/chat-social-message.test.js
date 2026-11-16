import { beforeEach, expect, it, vi } from "vitest";
const { db } = vi.hoisted(() => ({ db: {} }));
vi.mock("./prisma.js", () => ({ prisma: db }));
vi.mock("./user-blocks.js", () => ({
  assertConversationMessagingAllowed: vi.fn(),
}));
vi.mock("./chat-word-policy.js", () => ({
  assertChatWordsAllowed: async () => {},
}));
import { createMessage } from "./messaging.js";
let room, story;
beforeEach(() => {
  const saved = new Map();
  room = {
    id: "room",
    roomId: "ROOM",
    ownerId: "receiver",
    owner: { publicId: "R", name: "Host", status: "ACTIVE" },
    privacyMode: "PUBLIC",
    status: "LIVE",
    title: "Room",
    participantCount: 2,
  };
  story = {
    publicId: "STORY",
    authorId: "receiver",
    type: "TEXT",
    caption: "Hello",
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 86400000),
  };
  Object.assign(db, {
    $transaction: (fn) => fn(db),
    conversationParticipant: {
      findMany: vi.fn(async ({ where }) =>
        where.userId
          ? [{ userId: "receiver" }]
          : ["sender", "receiver"].map((userId) => ({ userId })),
      ),
      update: vi.fn(),
    },
    audioRoom: { findUnique: vi.fn(async () => room) },
    audioRoomBan: { count: vi.fn(async () => 0) },
    userBlock: { count: vi.fn(async () => 0) },
    story: { findFirst: vi.fn(async () => story) },
    message: {
      findUnique: vi.fn(async ({ where }) =>
        saved.get(where.senderId_clientMessageId.clientMessageId),
      ),
      create: vi.fn(async ({ data }) => {
        const record = { ...data, id: "m", sender: { publicId: "S" } };
        saved.set(data.clientMessageId, record);
        return record;
      }),
    },
    conversation: { update: vi.fn() },
    messageReceipt: { createMany: vi.fn() },
    notification: { create: vi.fn() },
  });
});
const send = (options, body = "", kind = "DIRECT") =>
  createMessage(
    { id: "chat", publicId: "CHAT", kind },
    { id: "sender" },
    body,
    null,
    { clientMessageId: "request-1", ...options },
  );
it("room sends are replay-safe and cards refresh when the room closes", async () => {
  const first = await send({ roomId: "ROOM" });
  expect(first).toMatchObject({
    type: "room",
    room: { available: true, open: true, memberCount: 2 },
  });
  room.status = "ENDED";
  expect(await send({ roomId: "ROOM" })).toMatchObject({
    id: first.id,
    room: { open: false },
  });
  expect(db.message.create).toHaveBeenCalledTimes(1);
  await expect(send({ roomId: "ANOTHER" })).rejects.toMatchObject({
    code: "IDEMPOTENCY_CONFLICT",
  });
});
it("story replies use the existing receipt flow and cannot resurrect unavailable stories", async () => {
  const first = await send({ storyId: "STORY" }, "❤️");
  expect(first).toMatchObject({
    type: "story_reply",
    body: "❤️",
    story: { available: true, caption: "Hello" },
  });
  story = null;
  expect(await send({ storyId: "STORY" }, "❤️")).toMatchObject({
    story: { available: false },
  });
  expect(db.message.create).toHaveBeenCalledTimes(1);
  expect(db.messageReceipt.createMany).toHaveBeenCalledTimes(1);
});
it("rejects cards in groups and mixed payloads before creating messages", async () => {
  await expect(send({ roomId: "ROOM" }, "", "GROUP")).rejects.toMatchObject({
    code: "VALIDATION_ERROR",
  });
  for (const options of [
    { roomId: "ROOM", clientMessageId: null },
    { roomId: "ROOM", storyId: "STORY" },
    { roomId: "ROOM", postId: "POST" },
    { roomId: "ROOM", mediaId: "MEDIA" },
  ])
    await expect(send(options)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  expect(db.message.create).not.toHaveBeenCalled();
});
