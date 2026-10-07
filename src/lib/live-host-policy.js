import { prisma } from "./prisma.js";

export function validateLiveHost(user) {
  if (!user || user.deletedAt || user.status !== "ACTIVE" || !user.appRoles?.includes("HOST"))
    throw Object.assign(new Error("Only an active approved host can go live."), { code: "LIVE_HOST_REQUIRED" });
  if (!user.isVerified)
    throw Object.assign(new Error("Complete KYC verification before going live."), { code: "LIVE_KYC_REQUIRED" });
}

export async function requireVerifiedLiveHost(userId, db = prisma) {
  const user = await db.user.findUnique({ where: { id: userId }, select: {
    status: true, deletedAt: true, appRoles: true, isVerified: true,
  } });
  validateLiveHost(user);
}
