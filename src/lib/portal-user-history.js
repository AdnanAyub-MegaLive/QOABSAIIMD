import { hasPermission } from "./portal-permissions.js";

export async function loadUserMessageHistory(db, admin, userId) {
  const canReadMessages = hasPermission(admin, "messages.view");
  const canReadNotifications = canReadMessages && hasPermission(admin, "notifications.view");
  const [messages, roomMessages, notifications] = await Promise.all([
    canReadMessages ? db.message.findMany({
      where: {
        OR: [
          {
            conversation: {
              kind: "DIRECT",
              participants: { some: { userId: userId } },
            },
          },
          { conversation: { kind: "WORLD" }, senderId: userId },
        ],
      },
      select: {
        publicId: true,
        senderId: true,
        body: true,
        createdAt: true,
        sender: { select: { publicId: true, name: true } },
        conversation: {
          select: {
            publicId: true,
            kind: true,
            name: true,
            participants: {
              select: {
                user: { select: { publicId: true, name: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    }) : Promise.resolve([]),
    canReadMessages ? db.audioRoomMessage.findMany({
      where: { senderId: userId },
      select: {
        publicId: true,
        roomPublicId: true,
        roomTitle: true,
        body: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    }) : Promise.resolve([]),
    canReadNotifications ? db.notification.findMany({
      where: { OR: [{ userId: null }, { userId: userId }] },
      select: {
        publicId: true,
        title: true,
        body: true,
        createdAt: true,
        userId: true,
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }) : Promise.resolve([]),
  ]);
  return { messages, roomMessages, notifications };
}
