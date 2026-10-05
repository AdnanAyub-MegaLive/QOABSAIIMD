import { prisma } from "./prisma.js";
import { formatDateOnly } from "./date-only.js";
import { getEffectiveUserId, reconcileExpiredSpecialIds } from "./special-id.js";
import { resolveUserPerks } from "./user-perks.js";
import { managementIdentity } from "./user-roles.js";

const profileSelect = {
  id: true,
  publicId: true,
  name: true,
  phone: true,
  email: true,
  country: true,
  bio: true,
  profileImage: true,
  gender: true,
  dob: true,
  isVerified: true,
  isOfficial: true,
  role: true,
  appRoles: true,
  countryHeadDesignation: true,
  status: true,
  vipLevel: true,
  createdAt: true,
  updatedAt: true,
  profilePrivate: true,
  showDateOfBirth: true,
};

export async function mobileUserProfile(userId, origin = null) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: profileSelect });
  if (!user) throw new Error("USER_NOT_FOUND");
  await reconcileExpiredSpecialIds();
  const identity = await getEffectiveUserId(user.id, user.publicId);
  const perks = origin ? (await resolveUserPerks([user], origin, ["FRAMES", "BADGES", "BUSINESS_CARD"])).get(user.publicId) : null;
  return {
    ...perks?.progression,
    id: identity.effectiveId,
    normalId: identity.normalId,
    specialId: identity.specialId,
    specialIdExpiresAt: identity.specialIdExpiresAt?.toISOString() ?? null,
    name: user.name,
    phone: user.phone,
    email: user.email,
    country: user.country,
    bio: user.bio,
    profileImage: user.profileImage,
    frameUrl: perks?.frameUrl ?? null,
    badgeUrl: perks?.badgeUrl ?? null,
    businessCardUrl: perks?.businessCardUrl ?? null,
    businessCardPosterUrl: perks?.businessCardPosterUrl ?? null,
    businessCardMimeType: perks?.businessCardMimeType ?? null,
    gender: user.gender,
    dob: formatDateOnly(user.dob),
    profilePrivate: Boolean(user.profilePrivate),
    showDateOfBirth: Boolean(user.showDateOfBirth),
    isVerified: Boolean(user.isVerified),
    isOfficial: Boolean(user.isOfficial),
    role: user.role,
    roles: user.appRoles,
    ...managementIdentity(user),
    status: user.status,
    vipLevel: user.vipLevel,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
