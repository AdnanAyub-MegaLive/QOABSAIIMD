import { serializeRoomChatMessages } from "./audio-room-chat.js";
export function plainRoomMessage(message) {
  return {
    id: message.publicId,
    requestId: message.requestId ?? null,
    roomId: message.roomPublicId,
    chatRevision: message.chatRevision,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
    sender: {
      publicId: message.senderPublicId,
      name: message.sender?.name ?? message.senderName,
      profileImage: message.sender?.profileImage ?? null,
    },
  };
}

export async function persistRoomMessage(db, args, origin = null, resolvePerks = null) {
  let perks = new Map();
  if (resolvePerks) {
    let timer;
    try {
      perks = await Promise.race([
        Promise.resolve().then(resolvePerks).catch(() => new Map()),
        new Promise(resolve => { timer = setTimeout(() => resolve(new Map()), 150); }),
      ]);
    } finally { clearTimeout(timer); }
  }
  return db.$transaction(async tx => {
    const message = await tx.audioRoomMessage.create(args);
    await tx.realtimeOutbox.create({
      data: {
        channel: `audio-room:${message.roomPublicId}`,
        event: "audio-room:message",
        payload: { success: true, data: origin ? (await serializeRoomChatMessages([message], origin, perks))[0] : plainRoomMessage(message) },
      },
    });
    return message;
  });
}
