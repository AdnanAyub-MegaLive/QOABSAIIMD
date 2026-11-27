import { resolveUserPerks } from "./user-perks.js";
import { videoError } from "./video-access.js";
import { emitToUser, emitToVideoLive } from "./realtime.js";
import { updateRtcPublishPermission } from "./rtc-moderation.js";

export const forbidden = () => videoError("LIVE_MODERATION_FORBIDDEN", "You are not allowed to do this in this live.");

export async function liveRole(db, live, userId) {
  if (!userId) return "VIEWER";
  if (live.hostId === userId) return "OWNER";
  const admin = await db.videoLiveAdmin.findUnique({ where: { sessionId_userId: { sessionId: live.id, userId } } });
  return admin ? "ADMIN" : "VIEWER";
}

export async function requireLiveStaff(db, live, userId) {
  const role = await liveRole(db, live, userId);
  if (role === "VIEWER") throw forbidden();
  return role;
}

export async function requireLiveOwner(db, live, userId, message = "Only the live host can perform this action.") {
  if (live.hostId === userId) return "OWNER";
  if (await liveRole(db, live, userId) === "ADMIN") throw forbidden();
  throw videoError("LIVE_HOST_REQUIRED", message);
}

export const canActOn = (actor, target) => actor === "OWNER" ? target !== "OWNER" : actor === "ADMIN" ? target === "VIEWER" : false;

export async function liveAdmins(db, sessionId, origin) {
  const rows = await db.videoLiveAdmin.findMany({ where: { sessionId }, include: { user: { select: { id: true, publicId: true, name: true, profileImage: true } } }, orderBy: { createdAt: "asc" } });
  const users = rows.map(row => row.user);
  const perks = users.length ? await resolveUserPerks(users, origin, ["FRAMES"]).catch(() => new Map()) : new Map();
  const admins = users.map(user => ({ publicId: user.publicId, name: user.name, profileImage: user.profileImage ?? null, frameUrl: perks.get(user.publicId)?.frameUrl ?? null, frameMimeType: perks.get(user.publicId)?.frameMimeType ?? null }));
  return { adminIds: admins.map(admin => admin.publicId), admins };
}

export async function liveModerationInfo(db, live, userId, origin) {
  const [{ adminIds, admins }, myRole] = await Promise.all([liveAdmins(db, live.id, origin), liveRole(db, live, userId)]);
  return { adminIds, admins, chatLocked: Boolean(live.chatLocked), seatsLocked: Boolean(live.seatsLocked), myRole };
}

export async function dropLiveGuest(db, live, target) {
  const rows = await db.videoLiveGuestRequest.findMany({ where: { sessionId: live.id, userId: target.id, status: { in: ["PENDING", "INVITED", "APPROVED"] } } });
  if (!rows.length) return null;
  const now = new Date(), approved = rows.find(row => row.status === "APPROVED");
  if (approved) await db.videoLiveGuestRequest.update({ where: { id: approved.id }, data: { status: "REMOVED", respondedAt: now } });
  const others = rows.filter(row => row.status !== "APPROVED").map(row => row.id);
  if (others.length) await db.videoLiveGuestRequest.updateMany({ where: { id: { in: others } }, data: { status: "EXPIRED", respondedAt: now } });
  if (!approved) return null;
  await updateRtcPublishPermission(`video-${live.publicId}`, target.publicId, false).catch(error => console.error("Guest publish revoke failed", error?.code ?? error?.message));
  const data = { liveId: live.publicId, requestId: approved.id, status: "REMOVED", reason: "REMOVED", user: { publicId: target.publicId } };
  await emitToUser(target.publicId, "live-video:guest-removed", { success: true, data });
  await emitToVideoLive(live.publicId, "live-video:guests-changed", { success: true, data });
  return data;
}
