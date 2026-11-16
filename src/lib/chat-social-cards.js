import { storyVisibility, storyDto, storyError } from "./stories.js";
async function members(db, conversationId) {
  return (
    await db.conversationParticipant.findMany({
      where: { conversationId },
      select: { userId: true },
    })
  ).map((m) => m.userId);
}
export async function roomCard(db, roomId, userIds, origin = "") {
  if (typeof roomId !== "string" || !roomId)
    return { id: "", available: false };
  const room = await db.audioRoom.findUnique({
    where: { roomId },
    select: {
      id: true,
      roomId: true,
      title: true,
      ownerId: true,
      status: true,
      isBlocked: true,
      coverImageUrl: true,
      coverRevision: true,
      participantCount: true,
      privacyMode: true,
      passwordHash: true,
      joiningDisabled: true,
      owner: {
        select: {
          publicId: true,
          name: true,
          profileImage: true,
          status: true,
          deletedAt: true,
        },
      },
    },
  });
  if (
    !room ||
    room.isBlocked ||
    room.owner.deletedAt ||
    room.owner.status !== "ACTIVE"
  )
    return { id: roomId, available: false };
  const blocked = await db.userBlock.count({
    where: {
      OR: [
        { blockerId: room.ownerId, blockedId: { in: userIds } },
        { blockedId: room.ownerId, blockerId: { in: userIds } },
      ],
    },
  });
  const banned = await db.audioRoomBan.count({
    where: {
      audioRoomId: room.id,
      userId: { in: userIds },
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  });
  if (
    blocked ||
    banned ||
    room.privacyMode !== "PUBLIC" ||
    room.passwordHash ||
    room.joiningDisabled
  )
    return { id: roomId, available: false };
  return {
    id: roomId,
    available: true,
    open: room.status === "LIVE",
    title: room.title,
    coverUrl: room.coverImageUrl
      ? new URL(
          room.coverImageUrl,
          origin ||
            process.env.MOBILE_API_BASE_URL ||
            "https://portal.megachat.live",
        ).toString()
      : null,
    memberCount: room.participantCount,
    owner: {
      publicId: room.owner.publicId,
      fullName: room.owner.name,
      profileImage: room.owner.profileImage,
    },
  };
}
export async function claimSocialCard(db, conversation, senderId, options) {
  const ids = await members(db, conversation.id);
  if (
    conversation.kind !== "DIRECT" ||
    ids.length !== 2 ||
    !ids.includes(senderId)
  )
    throw storyError("Cards require a direct conversation.");
  if (options.roomId) {
    const card = await roomCard(db, options.roomId, ids);
    if (!card.available || !card.open)
      throw storyError("This room cannot be shared with this person.", 403);
    return { kind: "room", metadata: { roomId: options.roomId } };
  }
  const story = await db.story.findFirst({
    where: { publicId: options.storyId, ...storyVisibility(senderId) },
    select: { authorId: true },
  });
  if (!story || story.authorId === senderId || !ids.includes(story.authorId))
    throw storyError("Story unavailable.", 404);
  return { kind: "story_reply", metadata: { storyId: options.storyId } };
}
export async function hydrateSocialCards(db, messages, origin = "") {
  if (
    !messages.some(
      (m) => !m.deletedAt && ["room", "story_reply"].includes(m.kind),
    )
  )
    return messages;
  const result = [];
  const memberCache = new Map(),
    cardCache = new Map();
  const cached = (map, key, read) => {
    if (!map.has(key)) map.set(key, read());
    return map.get(key);
  };
  for (const m of messages) {
    if (m.deletedAt || !["room", "story_reply"].includes(m.kind)) {
      result.push(m);
      continue;
    }
    const ids = await cached(memberCache, m.conversationId, () =>
      members(db, m.conversationId),
    );
    if (ids.length !== 2) {
      result.push({
        ...m,
        [m.kind === "room" ? "room" : "story"]: { available: false },
      });
      continue;
    }
    if (m.kind === "room") {
      result.push({
        ...m,
        room: await cached(
          cardCache,
          JSON.stringify([m.conversationId, m.metadata?.roomId]),
          () => roomCard(db, m.metadata?.roomId, ids, origin),
        ),
      });
      continue;
    }
    if (typeof m.metadata?.storyId !== "string") {
      result.push({ ...m, story: { id: "", available: false } });
      continue;
    }
    const rows = await cached(
      cardCache,
      JSON.stringify([m.conversationId, "story", m.metadata.storyId]),
      () =>
        Promise.all(
          ids.map((id) =>
            db.story.findFirst({
              where: { publicId: m.metadata?.storyId, ...storyVisibility(id) },
            }),
          ),
        ),
    );
    result.push({
      ...m,
      story: rows.every(Boolean)
        ? { ...storyDto(rows[0], origin), available: true }
        : { id: m.metadata?.storyId, available: false },
    });
  }
  return result;
}
