import { randomUUID, createHash } from "node:crypto";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import {
  decodeChatPicture,
  decodeChatVideo,
  readChatMultipart,
} from "./chat-media-validation.js";
export const storyError = (message, status = 422) =>
  Object.assign(new Error(message), {
    status,
    code: status === 404 ? "STORY_UNAVAILABLE" : "STORY_ERROR",
  });
export const storyAuthor = {
  id: true,
  publicId: true,
  name: true,
  profileImage: true,
};
export function storyVisibility(userId, now = new Date()) {
  return {
    deletedAt: null,
    expiresAt: { gt: now },
    author: {
      status: "ACTIVE",
      deletedAt: null,
      blockedUsers: { none: { blockedId: userId } },
      blockedByUsers: { none: { blockerId: userId } },
    },
    OR: [
      { authorId: userId },
      {
        status: "APPROVED",
        OR: [
          { audience: "PUBLIC" },
          {
            audience: "FOLLOWERS",
            author: { followers: { some: { followerId: userId } } },
          },
          {
            audience: "CLOSE_FRIENDS",
            author: { closeFriends: { some: { memberId: userId } } },
          },
        ],
      },
    ],
  };
}
export async function visibleStory(db, publicId, userId, now = new Date()) {
  const row = await db.story.findFirst({
    where: { publicId, ...storyVisibility(userId, now) },
    include: {
      author: { select: storyAuthor },
      views: { where: { userId }, take: 1 },
      _count: { select: { views: true } },
    },
  });
  if (!row) throw storyError("Story unavailable.", 404);
  return row;
}
export function storyDto(row, origin = "") {
  return {
    id: row.publicId,
    mediaUrl: row.mediaKey ? `${origin}/api/stories/${row.publicId}/media` : "",
    mediaType: row.type,
    caption: row.caption,
    background: row.background,
    status: row.status,
    durationMs: row.durationMs,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    viewed: Boolean(row.views?.length),
    viewCount: row._count?.views ?? 0,
  };
}
export function storyGroup(row, origin = "", perks = {}) {
  return {
    user: {
      publicId: row.author.publicId,
      fullName: row.author.name,
      profileImage: row.author.profileImage,
      frameUrl: perks?.frameUrl ?? null,
      frameMimeType: perks?.frameMimeType ?? null,
    },
    stories: [storyDto(row, origin)],
  };
}
export function storyMediaPath(key) {
  if (!/^[a-f0-9-]{36}$/.test(key)) throw storyError("Invalid media key.");
  return path.join(process.cwd(), "storage", "stories", key);
}
export async function deleteStoryMedia(key) {
  try {
    await unlink(storyMediaPath(key));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
}
export async function expireStories(db, now = new Date()) {
  const rows = await db.storyMediaObject.findMany({
    where: { expiresAt: { lte: now } },
    take: 100,
    orderBy: { expiresAt: "asc" },
  });
  for (const row of rows) {
    await deleteStoryMedia(row.key);
    await db.storyMediaObject.deleteMany({ where: { key: row.key } });
  }
}
export async function createStory(db, user, request, origin) {
  const form = await readChatMultipart(request),
    caption = String(form.get("caption") ?? "").trim(),
    audience = String(form.get("audience") ?? "PUBLIC"),
    background = String(form.get("background") ?? "#32104F"),
    requestId = String(form.get("requestId") ?? "");
  if (
    [...caption].length > 220 ||
    !["PUBLIC", "FOLLOWERS", "CLOSE_FRIENDS"].includes(audience) ||
    !/^#[0-9a-f]{6}$/i.test(background) ||
    !/^[a-zA-Z0-9-]{8,80}$/.test(requestId)
  )
    throw storyError(
      "Check caption (220 characters), audience and request ID.",
    );
  const file = form.get("media"),
    hasFile = file instanceof File && file.size > 0;
  if (!hasFile && !caption) throw storyError("Add text or media.");
  if (hasFile && file.size > 30 * 1024 * 1024)
    throw storyError("Video limit is 30 MB; image limit is 10 MB.", 413);
  const bytes = hasFile ? Buffer.from(await file.arrayBuffer()) : null;
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        caption,
        audience,
        background,
        mime: hasFile ? file.type : null,
      }),
    )
    .update(bytes ?? "")
    .digest("hex");
  const where = { authorId_requestId: { authorId: user.id, requestId } };
  const previous = await db.story.findUnique({ where });
  const replay = (row) => {
    if (row.fingerprint !== fingerprint)
      throw storyError("Request ID already used for another story.", 409);
    return storyDto(row, origin);
  };
  if (previous) return replay(previous);
  if (
    (await db.story.count({
      where: {
        authorId: user.id,
        createdAt: { gt: new Date(Date.now() - 86400000) },
      },
    })) >= 30
  )
    throw storyError("Daily story limit reached.", 429);
  let media = null;
  if (hasFile) {
    media = file.type.startsWith("image/")
      ? await decodeChatPicture(bytes, file.type)
      : await decodeChatVideo(bytes, file.type);
    if (media.durationMs > 30000)
      throw storyError("Story videos may be at most 30 seconds.");
  }
  const expiresAt = new Date(Date.now() + 86400000),
    key = media ? randomUUID() : null;
  if (key) {
    await db.storyMediaObject.create({ data: { key, expiresAt } });
    await mkdir(path.dirname(storyMediaPath(key)), {
      recursive: true,
      mode: 0o700,
    });
    await writeFile(storyMediaPath(key), media.bytes, {
      mode: 0o600,
      flag: "wx",
    });
  }
  try {
    const row = await db.story.create({
      data: {
        publicId: `STY-${randomUUID()}`,
        authorId: user.id,
        requestId,
        fingerprint,
        type: media ? (media.kind === "video" ? "VIDEO" : "IMAGE") : "TEXT",
        mediaKey: key,
        mediaMime: media?.mimeType,
        durationMs: media?.durationMs,
        caption,
        audience,
        background,
        expiresAt,
        status: "PENDING",
      },
    });
    return storyDto(row, origin);
  } catch (error) {
    if (key) {
      await deleteStoryMedia(key);
      await db.storyMediaObject.deleteMany({ where: { key } });
    }
    if (error.code === "P2002") {
      const prior = await db.story.findUnique({ where });
      if (prior) return replay(prior);
    }
    throw error;
  }
}
export async function storyMediaResponse(row, request) {
  if (!row.mediaKey) throw storyError("Media unavailable.", 404);
  let bytes;
  try {
    bytes = await readFile(storyMediaPath(row.mediaKey));
  } catch (e) {
    if (e.code === "ENOENT") throw storyError("Media unavailable.", 404);
    throw e;
  }
  const headers = {
    "Content-Type": row.mediaMime,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Accept-Ranges": "bytes",
  };
  const range = request.headers.get("range");
  if (range) {
    const match = /^bytes=(\d+)-(\d*)$/.exec(range);
    if (!match)
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${bytes.length}` },
      });
    const start = Number(match[1]),
      end = Math.min(Number(match[2] || bytes.length - 1), bytes.length - 1);
    if (start > end || start >= bytes.length)
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${bytes.length}` },
      });
    return new Response(bytes.subarray(start, end + 1), {
      status: 206,
      headers: {
        ...headers,
        "Content-Range": `bytes ${start}-${end}/${bytes.length}`,
        "Content-Length": String(end - start + 1),
      },
    });
  }
  return new Response(bytes, {
    headers: { ...headers, "Content-Length": String(bytes.length) },
  });
}
