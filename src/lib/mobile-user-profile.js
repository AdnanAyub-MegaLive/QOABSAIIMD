import { prisma } from "./prisma.js";
import { formatDateOnly } from "./date-only.js";
import { getEffectiveUserId, reconcileExpiredSpecialIds } from "./special-id.js";

const profileSelect = {
  id: true,
  publicId: true,
  name: true,
  phone: true,
  email: true,
  country: true,
  profileImage: true,
  gender: true,
  dob: true,
  isVerified: true,
  isOfficial: true,
  role: true,
  appRoles: true,
  status: true,
  vipLevel: true,
  createdAt: true,
  updatedAt: true,
};

export async function mobileUserProfile(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: profileSelect });
  if (!user) throw new Error("USER_NOT_FOUND");
  await reconcileExpiredSpecialIds();
  const identity = await getEffectiveUserId(user.id, user.publicId);
  return {
    id: identity.effectiveId,
    normalId: identity.normalId,
    specialId: identity.specialId,
    specialIdExpiresAt: identity.specialIdExpiresAt?.toISOString() ?? null,
    name: user.name,
    phone: user.phone,
    email: user.email,
    country: user.country,
    profileImage: user.profileImage,
    gender: user.gender,
    dob: formatDateOnly(user.dob),
    isVerified: Boolean(user.isVerified),
    isOfficial: Boolean(user.isOfficial),
    role: user.role,
    roles: user.appRoles,
    status: user.status,
    vipLevel: user.vipLevel,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
