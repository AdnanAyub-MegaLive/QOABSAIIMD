// An explicit inventory makes schema additions fail closed instead of silently
// retaining personal records or cascading into unrelated accounts.
export const deletionOwnedModels = new Set(`Story StoryView StoryReport StoryCloseFriend LegacyIdMapping AccountConnectionState GamePlayAccount SharedGameEntry GameTriviaHistory GamePlayChallenge GamePlayRound UserProgress ProgressLedger GiftRequest VideoLiveCover VideoLiveViewer UserFollow VideoLiveBan VideoLiveReport VideoLiveGuestRequest UserMedal ProfileRelationship UserAvatarHistory VipOwnership VipMembership UserProfileVisit UserProfileLike FriendRequest ConversationParticipant Message MessageReaction MessageReceipt UserBlock AudioRoomMessage Notification NotificationRead UploadAssetAssignment CustomRoomBackgroundRequest UserEquippedProp AgencyApplication AgencyJoinRequest Post PostLike PostShare PostComment PostCommentLike ProfileCover ProfileCoverItem Device Ban ManagementWebSession TalentVerification UserAlbumItem SpecialIdAssignment GameLog GameRound GamePlayerSession AudioRoomVisit UserGiftInventory AudioRoomRole AudioRoomBan AudioRoomModerationLog AudioRoomMember AudioRoomSeatRequest AudioRoomSeatInvitation DailyTaskInstance DailyTaskStreak NewUserRewardClaim AudioRoomMicSession PrettyIdGrant TeamInvitation`.split(' '));
export const deletionRetainedModels = new Set(`GiftTransaction CurrencyRequest ResellerPayout VipPurchase RoomBanner PropPurchase CoinAdjustment WalletTopUpOrder WalletWithdrawal WalletTransaction AudioRoomAdmission RedEnvelope RedEnvelopeClaim GoogleRechargeReceipt`.split(' '));
export const deletionSharedModels = new Set(['User', 'Agency', 'Conversation', 'AudioRoomSeat', 'AudioRoom', 'VideoLiveSession']);
export function assertDeletionInventory(models) {
  for (const model of models) {
    if (model.fields.some(f => f.kind === 'object' && f.type === 'User')
      && !deletionOwnedModels.has(model.name) && !deletionRetainedModels.has(model.name) && !deletionSharedModels.has(model.name))
      throw new Error(`UNREVIEWED_USER_RELATION:${model.name}`);
  }
}
// Remove a target's embedded profile without changing other participants or
// monetary fields. Identifiers are matched in identity fields, never amounts.
const identityKey = /^(id|publicId|userId|userPublicId|senderId|recipientId|recipientUserId|recipientPublicId|senderPublicId|ownerId|actorId|uid|senderUserId|hostId|grabbedUserIds|paidUserIds)$/i;
const privateKey = /name|label|email|phone|avatar|image|photo|frame|cover|bio|location|country|device|address|bank|token|password|legal|dob|birth/i;
export function redactDeletedIdentity(value, ids, replacement, key = '', inherited = false) {
  if (Array.isArray(value)) return value.map(v => redactDeletedIdentity(v, ids, replacement, key, inherited));
  if (value && typeof value === 'object') {
    const hasIdentity = Object.keys(value).some(k => identityKey.test(k));
    const own = (!hasIdentity && inherited) || Object.entries(value).some(([k,v]) => identityKey.test(k) && ids.has(String(v)));
    return Object.fromEntries(Object.entries(value).map(([k,v]) => [ids.has(k) ? replacement : k,
      own && privateKey.test(k) ? null : redactDeletedIdentity(v, ids, replacement, k, own || ids.has(k))]));
  }
  return identityKey.test(key) && ids.has(String(value)) ? replacement : value;
}
export function deletedUserData(publicId, now = new Date()) {
  return { publicId, name: 'Deleted User', email: null, phone: null, googleEmail: null, googleSubject: null,
    signupDeviceId: null, onboardingCompletedAt: null, countryChangeUsedAt: null, birthdayChangeUsedAt: null, companyBdCountry: null, supervisorUserId: null, teamRole: null, teamGrantedRole: null,
    countryHeadDesignation: null, country: null, bio: null, profileImage: null, gender: null, dob: null,
    agencyId: null, passwordHash: null, appRoles: ['LISTENER'], role: 'LISTENER', status: 'BANNED',
    isVerified: false, isOfficial: false, vipLevel: 0, coinBalance: 0n, resellerCoinBalance: 0n,
    hostSalaryCoinBalance: 0n, couponBalance: 0, totalSpent: 0n, totalTopUp: 0n,
    profilePrivate: true, showDateOfBirth: false, lastLoginAt: null, hostSince: null,
    deletedAt: now, forcedLogoutAt: now, sessionVersion: { increment: 1 } };
}
