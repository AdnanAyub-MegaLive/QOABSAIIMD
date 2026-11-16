import { beforeAll, afterAll, test, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { PrismaPGlite } from "pglite-prisma-adapter";
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import {
  createStory,
  visibleStory,
  expireStories,
  storyMediaPath,
  storyMediaResponse,
} from "./stories.js";
import {
  claimSocialCard,
  hydrateSocialCards,
  roomCard,
} from "./chat-social-cards.js";
import { writeFile, mkdir, access } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
let engine, db, a, b, c, story, conversation;
beforeAll(async () => {
  const sql = execFileSync(
    process.execPath,
    [
      "node_modules/prisma/build/index.js",
      "migrate",
      "diff",
      "--from-empty",
      "--to-schema",
      "prisma/schema.prisma",
      "--script",
    ],
    { encoding: "utf8" },
  );
  engine = new PGlite();
  await engine.exec(sql);
  db = new PrismaClient({ adapter: new PrismaPGlite(engine) });
  [a, b, c] = await Promise.all(
    ["ST-A", "ST-B", "ST-C"].map((publicId) =>
      db.user.create({ data: { publicId, name: publicId } }),
    ),
  );
  conversation = await db.conversation.create({
    data: {
      publicId: "ST-CONV",
      kind: "DIRECT",
      participants: { create: [{ userId: a.id }, { userId: b.id }] },
    },
  });
}, 30000);
afterAll(async () => {
  await db?.$disconnect();
  await engine?.close();
});
const request = (caption = "Hello", id = "request-123") => {
  const form = new FormData();
  form.set("caption", caption);
  form.set("requestId", id);
  return new Request("http://localhost/api/stories", {
    method: "POST",
    body: form,
  });
};
test("posting is pending, bounded, idempotent and expires in 24 hours", async () => {
  const result = await createStory(db, a, request(), "http://localhost");
  const replay = await createStory(db, a, request(), "http://localhost");
  expect(replay.id).toBe(result.id);
  expect(result.status).toBe("PENDING");
  expect(
    new Date(result.expiresAt) - new Date(result.createdAt),
  ).toBeGreaterThan(86390000);
  await expect(
    createStory(db, a, request("Changed"), ""),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    createStory(db, a, request("a".repeat(221), "request-long"), ""),
  ).rejects.toMatchObject({ status: 422 });
  story = await visibleStory(db, result.id, a.id);
  await expect(visibleStory(db, result.id, b.id)).rejects.toMatchObject({
    status: 404,
  });
});
test("audiences, blocks, moderation and expiry are enforced on reads and DM cards", async () => {
  await db.story.update({
    where: { id: story.id },
    data: { status: "APPROVED" },
  });
  expect((await visibleStory(db, story.publicId, b.id)).id).toBe(story.id);
  await db.story.update({
    where: { id: story.id },
    data: { audience: "FOLLOWERS" },
  });
  await expect(visibleStory(db, story.publicId, b.id)).rejects.toThrow();
  await db.userFollow.create({ data: { followerId: b.id, followedId: a.id } });
  expect((await visibleStory(db, story.publicId, b.id)).id).toBe(story.id);
  await db.story.update({
    where: { id: story.id },
    data: { audience: "CLOSE_FRIENDS" },
  });
  await expect(visibleStory(db, story.publicId, b.id)).rejects.toThrow();
  await db.storyCloseFriend.create({ data: { ownerId: a.id, memberId: b.id } });
  const claim = await claimSocialCard(db, conversation, b.id, {
    storyId: story.publicId,
  });
  expect(claim.kind).toBe("story_reply");
  await expect(
    claimSocialCard(db, conversation, c.id, { storyId: story.publicId }),
  ).rejects.toThrow();
  const message = { conversationId: conversation.id, ...claim };
  expect((await hydrateSocialCards(db, [message]))[0].story.available).toBe(
    true,
  );
  await db.userBlock.create({ data: { blockerId: b.id, blockedId: a.id } });
  expect((await hydrateSocialCards(db, [message]))[0].story.available).toBe(
    false,
  );
  await db.userBlock.deleteMany();
  await db.story.update({
    where: { id: story.id },
    data: { expiresAt: new Date(0) },
  });
  expect((await hydrateSocialCards(db, [message]))[0].story.available).toBe(
    false,
  );
});
test("views are unique and cascade on story deletion", async () => {
  await db.storyView.createMany({
    data: [
      { storyId: story.id, userId: b.id },
      { storyId: story.id, userId: b.id },
    ],
    skipDuplicates: true,
  });
  expect(await db.storyView.count({ where: { storyId: story.id } })).toBe(1);
  await db.story.delete({ where: { id: story.id } });
  expect(await db.storyView.count()).toBe(0);
});
test("room cards are live, DM-only and reject locked or banned destinations", async () => {
  const room = await db.audioRoom.create({
    data: {
      roomId: "ST-ROOM",
      ownerId: a.id,
      title: "Test room",
      status: "LIVE",
    },
  });
  expect(
    (await claimSocialCard(db, conversation, b.id, { roomId: room.roomId }))
      .kind,
  ).toBe("room");
  await expect(
    claimSocialCard(db, { ...conversation, kind: "GROUP" }, b.id, {
      roomId: room.roomId,
    }),
  ).rejects.toThrow();
  await db.audioRoom.update({
    where: { id: room.id },
    data: { passwordHash: "secret" },
  });
  expect((await roomCard(db, room.roomId, [a.id, b.id])).available).toBe(false);
  await db.audioRoom.update({
    where: { id: room.id },
    data: { passwordHash: null },
  });
  await db.audioRoomBan.create({
    data: { publicId: "ST-BAN", audioRoomId: room.id, userId: b.id },
  });
  expect((await roomCard(db, room.roomId, [a.id, b.id])).available).toBe(false);
  await db.audioRoomBan.deleteMany();
  await db.audioRoom.update({
    where: { id: room.id },
    data: { status: "ENDED" },
  });
  expect((await roomCard(db, room.roomId, [a.id, b.id])).open).toBe(false);
});
test("private media supports ranges and expiry removes the file", async () => {
  const key = randomUUID(),
    file = storyMediaPath(key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, "0123456789");
  await db.storyMediaObject.create({ data: { key, expiresAt: new Date(0) } });
  const response = await storyMediaResponse(
    { mediaKey: key, mediaMime: "video/mp4" },
    new Request("http://localhost", { headers: { Range: "bytes=2-4" } }),
  );
  expect(response.status).toBe(206);
  expect(await response.text()).toBe("234");
  expect(response.headers.get("cache-control")).toContain("no-store");
  await expireStories(db);
  await expect(access(file)).rejects.toThrow();
  expect(await db.storyMediaObject.count()).toBe(0);
});

test("uploads decode signatures, persist media outside rows, and reject disguised files", async () => {
  const sharp = (await import("sharp")).default;
  const bytes = await sharp({
    create: { width: 8, height: 8, channels: 3, background: "#8844cc" },
  })
    .png()
    .toBuffer();
  const form = new FormData();
  form.set("requestId", "picture-123");
  form.set("media", new File([bytes], "image.png", { type: "image/png" }));
  const result = await createStory(
    db,
    a,
    new Request("http://localhost/api/stories", { method: "POST", body: form }),
    "http://localhost",
  );
  const row = await db.story.findUnique({ where: { publicId: result.id } });
  expect(row.type).toBe("IMAGE");
  expect(row.mediaMime).toBe("image/webp");
  expect(result.mediaUrl).toContain(`/api/stories/${result.id}/media`);
  await db.storyMediaObject.update({
    where: { key: row.mediaKey },
    data: { expiresAt: new Date(0) },
  });
  await expireStories(db);
  const bad = new FormData();
  bad.set("requestId", "picture-bad");
  bad.set(
    "media",
    new File(["not an image"], "image.png", { type: "image/png" }),
  );
  await expect(
    createStory(
      db,
      a,
      new Request("http://localhost", { method: "POST", body: bad }),
      "",
    ),
  ).rejects.toThrow();
});
