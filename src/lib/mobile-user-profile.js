import { prisma } from "./prisma.js";
import { equippedProfileAssets } from "./public-profile.js";
import { namedDecoration, perkMediaFields } from "./decoration-media.js";
import { profileCardArtwork } from "./profile-card-artwork.js";
import { publicProgression } from "./progression.js";
import { activityProgress } from "./activity-levels.js";
import { profileCoverDto } from "./profile-cover.js";
import { formatDateOnly } from "./date-only.js";
import { getEffectiveUserId, reconcileExpiredSpecialIds } from "./special-id.js";
import { resolveUserPerks } from "./user-perks.js";
import { managementIdentity } from "./user-roles.js";
import { profileEditPermissions } from "./profile-edit-policy.js";

const profileSelect = {
  onboardingCompletedAt: true,
  countryChangeUsedAt: true,
  birthdayChangeUsedAt: true,
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
  const equippedAssets = origin ? (await equippedProfileAssets([user], origin)).get(user.id) : null;
  return {
    ...await profileCardArtwork(prisma,user.id,(await publicProgression([user],origin)).get(user.publicId)?.charmLevel??0,origin),
    ...await activityProgress("GAME", user.id, origin).then(p=>({gameLevel:p.level,gameLevelBadgeUrl:p.badgeUrl,gameLevelBackground:p.background,gameLevelBackgroundUrl:p.backgroundUrl,gameLevelBackgroundMimeType:p.backgroundMimeType,gameLevelBackgroundMediaVersion:p.backgroundMediaVersion,gameProgression:p})),
    ...await profileCoverDto(prisma, user.id, user.id, origin),
    ...profileEditPermissions(user),
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
    ...perkMediaFields(perks),
    equippedAssets,
    ...namedDecoration("frame", equippedAssets?.avatarFrame), ...namedDecoration("badge", equippedAssets?.profileBadge),
    ...namedDecoration("homeDress", equippedAssets?.profileDress), ...namedDecoration("userTag", equippedAssets?.userTag), ...namedDecoration("profileBackground", equippedAssets?.profileBackground),
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
