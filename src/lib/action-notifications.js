import { randomUUID } from "node:crypto";

export const welcomeDefaults = { welcomeEnabled: true, welcomeTitle: "Welcome to MegaLive!", welcomeBody: "Welcome to MegaLive! Explore rooms, meet people and enjoy your time with us.", revision: 0 };
export function notificationDto(row) {
  return { id: row.publicId, type: row.type, title: row.title, body: row.body, action: row.action ?? null, createdAt: row.createdAt.toISOString(), readAt: row.reads?.[0]?.readAt?.toISOString() ?? null };
}
// Pass the action's transaction client. Nothing is emitted before commit.
export async function notifyAction(tx, { userId, key, type, title, body, action }) {
  if (!userId || !key) throw new Error("Notification recipient and source key are required.");
  const sourceKey = `${userId}:${key}`;
  return tx.notification.upsert({ where: { sourceKey }, update: {}, create: {
    publicId: `NOT-${randomUUID().replaceAll("-", "").toUpperCase()}`, sourceKey,
    userId, type, title, body, ...(action ? { action } : {}),
  } });
}
export async function welcomeNotification(tx, user) {
  const settings = await tx.notificationSettings.findUnique({ where: { id: "GLOBAL" } }) ?? welcomeDefaults;
  if (settings.welcomeEnabled) await notifyAction(tx, { userId: user.id, key: "welcome", type: "WELCOME", title: settings.welcomeTitle, body: settings.welcomeBody, action: { screen: "HOME" } });
}
let delivering = false;
export async function dispatchNotifications(db, io) {
  if (!io || delivering) return;
  delivering = true;
  try {
    const rows = await db.notification.findMany({ where: { deliveredAt: null, retractedAt: null }, include: { user: { select: { publicId: true, status: true, deletedAt: true } } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 100 });
    for (const row of rows) {
      // Serialize with retraction and re-read after the lock: a stale batch
      // cannot publish an announcement that was retracted in the meantime.
      await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Notification" WHERE id = ${row.id} FOR UPDATE`;
      const current = await tx.notification.findUnique({where:{id:row.id},select:{retractedAt:true,deliveredAt:true}});
      if (!current || current.retractedAt || current.deliveredAt) return;
      // Resolve the current public ID, including USR/TLN transitions.
      if (row.userId === null) io.emit("notification:new", notificationDto(row));
      else if (row.user?.status === "ACTIVE" && !row.user.deletedAt) io.to(`user:${row.user.publicId}`).emit("notification:new", notificationDto(row));
      await tx.notification.update({ where: { id: row.id }, data: { deliveredAt: new Date() } });
      });
    }
  } finally { delivering = false; }
}
