import { prisma } from "./prisma";
import mobileSession from "./mobile-session.cjs";
import { assertMobileSession, mobileSessionError } from "./mobile-session-state";

export const mobileCorsHeaders = {
  "Access-Control-Allow-Origin": process.env.MOBILE_APP_ORIGIN || "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Idempotency-Key",
  "Cache-Control": "no-store, max-age=0",
};

export function mobileJson(body, status = 200) {
  return Response.json(body, { status, headers: mobileCorsHeaders });
}

export function mobileOptions() {
  return new Response(null, { status: 204, headers: mobileCorsHeaders });
}

export async function requireMobileUser(request) {
  const token = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  const payload = mobileSession.verifyMobileSessionToken(token);
  const user = await prisma.user.findUnique({
    where: { publicId: payload.userId },
    select: {
      id: true,
      publicId: true,
      name: true,
      country: true,
      profileImage: true,
      gender: true,
      dob: true,
      isVerified: true,
      isOfficial: true,
      role: true,
      appRoles: true,
      vipLevel: true,
      status: true,
      deletedAt: true,
      sessionVersion: true,
      forcedLogoutAt: true,
      coinBalance: true,
    },
  });
  assertMobileSession(user, payload);

  if (payload.deviceId) {
    const device = await prisma.device.findUnique({
      where: { userId_macAddress: { userId: user.id, macAddress: payload.deviceId } },
      select: { isBanned: true },
    });
    if (!device) throw new Error("DEVICE_NOT_REGISTERED");
    if (device.isBanned) throw new Error("DEVICE_BANNED");
  }
  return user;
}

export async function requireMobileRole(request, allowedRoles) {
  const user = await requireMobileUser(request);
  const roles = new Set([user.role, ...(user.appRoles ?? [])]);
  if (!allowedRoles.some((role) => roles.has(role))) {
    throw new Error("ROLE_FORBIDDEN");
  }
  return user;
}

export function mobileApiError(error, fallbackCode = "REQUEST_FAILED") {
  if (error?.code === "BD_REFERENCE_INVALID") return mobileJson({ success: false, error: { code: error.code, message: error.message } }, error.status === 404 ? 404 : 422);
  const known = {
    INVALID_SESSION: [401, "INVALID_SESSION", "The mobile session is invalid or expired."],
    SESSION_REVOKED: [401, "SESSION_REVOKED", "This mobile session has been revoked. Please sign in again."],
    INVALID_SESSION_TOKEN: [401, "INVALID_SESSION", "The mobile session is invalid or expired."],
    EXPIRED_SESSION_TOKEN: [401, "INVALID_SESSION", "The mobile session is invalid or expired."],
    DEVICE_NOT_REGISTERED: [401, "DEVICE_NOT_REGISTERED", "This session is not associated with an active device."],
    DEVICE_BANNED: [403, "DEVICE_BANNED", "This device has been banned."],
    BD_REQUIRED: [403, "BD_REQUIRED", "An active BD role is required."],
    BD_AGENCY_NOT_FOUND: [404, "BD_AGENCY_NOT_FOUND", "This agency is not assigned to you."],
    BD_NOT_FOUND: [422, "BD_NOT_FOUND", "Choose an active BD using their user ID."],
    AGENCY_INPUT_INVALID: [422, "AGENCY_INPUT_INVALID", "Agency name and owner user ID are required (maximum 120 and 50 characters)."],
    AGENCY_OWNER_UNAVAILABLE: [409, "AGENCY_OWNER_UNAVAILABLE", "The owner must be an active user."],
    ALREADY_HAS_AGENCY: [409, "ALREADY_HAS_AGENCY", "This user already owns or belongs to an agency."],
    ALREADY_APPLIED: [409, "ALREADY_APPLIED", "This user already has a pending or approved agency application."],
    APPLICATION_NOT_FOUND: [404, "APPLICATION_NOT_FOUND", "Agency application not found."],
    ALREADY_REVIEWED: [409, "ALREADY_REVIEWED", "This application has already been reviewed."],
    AGENCY_REVIEW_INVALID: [422, "AGENCY_REVIEW_INVALID", "Choose APPROVED or REJECTED; rejection requires a reason (maximum 1000 characters)."],
    ADMIN_ID_ATTEMPT_LIMIT_REACHED: [409, "ADMIN_ID_ATTEMPT_LIMIT_REACHED", "Three applications under this BD have been rejected. Choose another BD."],
    P2034: [409, "AGENCY_CONFLICT", "Another update occurred. Refresh and retry."],
    P2002: [409, "AGENCY_CONFLICT", "This agency or application already exists. Refresh and retry."],
    RESELLER_REQUIRED: [403, "RESELLER_REQUIRED", "Only active Resellers can transfer coins to other users."],
    ROLE_FORBIDDEN: [403, "ROLE_FORBIDDEN", "Your account does not have permission for this action."],
    USER_BLOCKED: [403, "USER_BLOCKED", "This action is unavailable because one of these users has blocked the other."],
    SELF_FOLLOW: [422, "SELF_FOLLOW", "You cannot follow yourself."],
    CONVERSATION_NOT_FOUND: [404, "CONVERSATION_NOT_FOUND", "Conversation not found."],
    MESSAGE_NOT_FOUND: [404, "MESSAGE_NOT_FOUND", "Message not found."],
    MESSAGE_RECEIPT_FORBIDDEN: [403, "MESSAGE_RECEIPT_FORBIDDEN", "This message cannot be acknowledged by the current user."],
    MESSAGE_EDIT_FORBIDDEN: [403, "MESSAGE_EDIT_FORBIDDEN", "You can only edit your own messages."],
    MESSAGE_DELETE_FORBIDDEN: [403, "MESSAGE_DELETE_FORBIDDEN", "You can only delete your own messages."],
    MESSAGE_EDIT_WINDOW_EXPIRED: [409, "MESSAGE_EDIT_WINDOW_EXPIRED", "Messages can only be edited during the first 15 minutes."],
    MESSAGE_DELETED: [409, "MESSAGE_DELETED", "This message has already been deleted."],
    SYNC_CURSOR_INVALID: [422, "SYNC_CURSOR_INVALID", "The message sync cursor is invalid."],
    GROUP_NAME_INVALID: [422, "GROUP_NAME_INVALID", "Group names must contain between 2 and 80 characters."],
    GROUP_MEMBERS_INVALID: [422, "GROUP_MEMBERS_INVALID", "A group requires between 1 and 99 other active members."],
    GROUP_MEMBER_NOT_FOUND: [404, "GROUP_MEMBER_NOT_FOUND", "One or more group members could not be found."],
    GROUP_MEMBER_EXISTS: [409, "GROUP_MEMBER_EXISTS", "That user is already a member of this group."],
    GROUP_CONVERSATION_REQUIRED: [422, "GROUP_CONVERSATION_REQUIRED", "This operation requires a group conversation."],
    GROUP_OWNER_REQUIRED: [403, "GROUP_OWNER_REQUIRED", "Only the group owner can manage other members."],
    GROUP_OWNER_CANNOT_LEAVE: [409, "GROUP_OWNER_CANNOT_LEAVE", "Transfer group ownership before removing the owner."],
    NOTIFICATION_NOT_FOUND: [404, "NOTIFICATION_NOT_FOUND", "Notification not found."],
    USER_NOT_FOUND: [404, "USER_NOT_FOUND", "The selected user was not found."],
    PROFILE_BLOCKED: [403, "PROFILE_BLOCKED", "This profile is unavailable because one of these users has blocked the other."],
    PROFILE_PRIVATE: [403, "PROFILE_PRIVATE", "This profile is private."],
    LIVE_NOT_FOUND: [404, "LIVE_NOT_FOUND", "This live video is unavailable."],
    LIVE_HOST_REQUIRED: [403, "LIVE_HOST_REQUIRED", "Only the live host can perform this action."],
    LIVE_BANNED: [403, "LIVE_BANNED", "You are banned from this live video."],
    LIVE_MODERATION_FORBIDDEN: [403, "LIVE_MODERATION_FORBIDDEN", "Only the live host can manage bans and reports."],
    LIVE_GIFT_FORBIDDEN: [403, "LIVE_GIFT_FORBIDDEN", "Join this live video before sending a gift to its host."],
    GUEST_REQUEST_UNAVAILABLE: [409, "GUEST_REQUEST_UNAVAILABLE", "This guest request is no longer available."],
    GUEST_SLOTS_FULL: [409, "GUEST_SLOTS_FULL", "All four guest publisher slots are occupied."],
    LIVEKIT_NOT_CONFIGURED: [503, "LIVEKIT_NOT_CONFIGURED", "LiveKit is not configured on this server."],
    PK_CONFLICT: [409, "PK_CONFLICT", "One of these rooms is already participating in PK."],
    PK_NOT_FOUND: [404, "PK_NOT_FOUND", "This PK session was not found."],
    PK_STATE_INVALID: [409, "PK_STATE_INVALID", "That action is unavailable in the current PK state."],
    BACKPACK_INSUFFICIENT: [409, "BACKPACK_INSUFFICIENT", "Your backpack does not contain enough of this gift."],
    GIFT_NOT_FOUND: [404, "GIFT_NOT_FOUND", "The selected gift is unavailable."],
    HOST_AGENCY_REQUIRED: [409, "HOST_AGENCY_REQUIRED", "A host must belong to an agency before receiving gifts."],
    CAMPAIGN_UNAVAILABLE: [409, "CAMPAIGN_UNAVAILABLE", "No active campaign is available in this room."],
    FRIEND_REQUEST_NOT_FOUND: [404, "FRIEND_REQUEST_NOT_FOUND", "Friend request not found."],
    FRIEND_REQUEST_FORBIDDEN: [403, "FRIEND_REQUEST_FORBIDDEN", "You cannot respond to this friend request."],
    ALREADY_FRIENDS: [409, "ALREADY_FRIENDS", "You are already friends with this user."],
    REQUEST_ALREADY_PENDING: [409, "REQUEST_ALREADY_PENDING", "A friend request is already pending."],
    FRIEND_REQUEST_RESOLVED: [409, "FRIEND_REQUEST_RESOLVED", "This friend request has already been resolved."],
    SELF_FRIEND_REQUEST: [422, "SELF_FRIEND_REQUEST", "You cannot send a friend request to yourself."],
    STORE_ITEM_NOT_FOUND: [404, "STORE_ITEM_NOT_FOUND", "This item is not available for purchase."],
    PROP_ALREADY_OWNED: [409, "PROP_ALREADY_OWNED", "You already own this item."],
    INSUFFICIENT_COINS: [409, "INSUFFICIENT_COINS", "Your coin balance is too low for this purchase."],
    RECIPIENT_INACTIVE: [409, "RECIPIENT_INACTIVE", "The recipient account is not active."],
    SELF_TRANSFER: [422, "SELF_TRANSFER", "You cannot transfer coins to yourself."],
    TRANSFER_LIMIT: [422, "TRANSFER_LIMIT", "The transfer amount is outside the allowed limits."],
    WITHDRAWAL_LIMIT: [422, "WITHDRAWAL_LIMIT", "The withdrawal amount is outside the allowed limits."],
    WITHDRAWAL_NOT_ALLOWED: [403, "WITHDRAWAL_NOT_ALLOWED", "Only an agency-linked host can withdraw salary coins."],
    KYC_REQUIRED: [403, "KYC_REQUIRED", "Complete account verification before requesting a withdrawal."],
    INSUFFICIENT_SALARY: [409, "INSUFFICIENT_SALARY", "Your host salary balance is too low for this withdrawal."],
    COIN_PACKAGE_NOT_FOUND: [404, "COIN_PACKAGE_NOT_FOUND", "The selected coin package is unavailable."],
    PAYMENT_METHOD_NOT_SUPPORTED: [422, "PAYMENT_METHOD_NOT_SUPPORTED", "The selected payment method is not supported."],
    PAYMENT_PROVIDER_NOT_CONFIGURED: [503, "PAYMENT_PROVIDER_NOT_CONFIGURED", "The payment provider is not configured yet."],
    INVALID_IDEMPOTENCY_KEY: [422, "INVALID_IDEMPOTENCY_KEY", "Idempotency-Key must be 8 to 128 safe characters."],
    IDEMPOTENCY_KEY_REUSED: [409, "IDEMPOTENCY_KEY_REUSED", "This idempotency key was already used for a different top-up request."],
    PROP_NOT_OWNED: [403, "PROP_NOT_OWNED", "You do not own this item or its ownership has expired."],
    PROP_NOT_FOUND: [404, "PROP_NOT_FOUND", "The selected prop was not found."],
    PROP_NOT_EQUIPPABLE: [422, "PROP_NOT_EQUIPPABLE", "This item cannot be applied to a profile."],
    SELF_CONVERSATION: [422, "SELF_CONVERSATION", "You cannot start a direct conversation with yourself."],
    TASK_NOT_FOUND: [404, "TASK_NOT_FOUND", "This task is no longer available."],
    TASK_NOT_READY: [409, "TASK_NOT_READY", "Complete the task before claiming its reward."],
    TASK_ALREADY_CLAIMED: [409, "TASK_ALREADY_CLAIMED", "This task reward has already been claimed."],
    TASK_EXPIRED: [409, "TASK_EXPIRED", "This task period has ended. Refresh the task list."],
    TASK_CLAIM_ROUTE_INVALID: [422, "TASK_CLAIM_ROUTE_INVALID", "Use the correct claim action for this task type."],
    ROOM_UNAVAILABLE: [404, "ROOM_UNAVAILABLE", "This audio room is unavailable."],
    ROOM_BLOCKED: [403, "ROOM_BLOCKED", "You are blocked from this audio room."],
    INVALID_CURSOR: [422, "INVALID_CURSOR", "The room chat cursor is invalid."],
    ROOM_OWNER_REQUIRED: [403, "ROOM_OWNER_REQUIRED", "Only the room owner can perform this action."],
    ROOM_PERMISSION_DENIED: [403, "ROOM_PERMISSION_DENIED", "You do not have permission to manage this room."],
    ROOM_MUSIC_JOIN_REQUIRED: [409, "ROOM_MUSIC_JOIN_REQUIRED", "Join this audio room before publishing room music."],
    ROOM_MUSIC_NOT_ACTIVE: [409, "ROOM_MUSIC_NOT_ACTIVE", "No room music is currently selected."],
    MUSIC_TRACK_NOT_FOUND: [404, "MUSIC_TRACK_NOT_FOUND", "The selected catalog track is unavailable."],
    MUSIC_FILE_TOO_LARGE: [413, "MUSIC_FILE_TOO_LARGE", "Music tracks must be no larger than 20 MB."],
    MUSIC_FILE_TYPE_INVALID: [415, "MUSIC_FILE_TYPE_INVALID", "Music tracks must be MP3, M4A, AAC, OGG, or WAV audio."],
    MUSIC_DURATION_INVALID: [422, "MUSIC_DURATION_INVALID", "Music tracks must be no longer than 15 minutes."],
    MUSIC_SOURCE_UNSUPPORTED: [422, "MUSIC_SOURCE_UNSUPPORTED", "Room music must use a catalog track."],
    ROOM_BANNED: [403, "ROOM_BANNED", "You are not allowed to join this room."],
    ROOM_PAYMENT_REQUIRED: [402, "ROOM_PAYMENT_REQUIRED", "Paid admission is required before joining this room."],
    ROOM_BACKGROUND_UNAVAILABLE: [403, "ROOM_BACKGROUND_UNAVAILABLE", "This room background is unavailable or not owned by you."],
    ROOM_BACKGROUND_TYPE_UNSUPPORTED: [422, "ROOM_BACKGROUND_TYPE_UNSUPPORTED", "Room backgrounds must be PNG, JPEG, WebP, or MP4."],
    SEAT_STYLE_UNAVAILABLE: [403, "SEAT_STYLE_UNAVAILABLE", "This seat style is unavailable or not owned by you."],
    SEAT_STYLE_TYPE_UNSUPPORTED: [422, "SEAT_STYLE_TYPE_UNSUPPORTED", "Seat styles must be PNG, JPEG, or WebP."],
    CUSTOM_BACKGROUND_DISABLED: [403, "CUSTOM_BACKGROUND_DISABLED", "Custom background submissions are currently disabled."],
    CUSTOM_BACKGROUND_PRICE_INVALID: [422, "CUSTOM_BACKGROUND_PRICE_INVALID", "The selected custom background price is unavailable."],
    CUSTOM_BACKGROUND_TYPE_INVALID: [422, "CUSTOM_BACKGROUND_TYPE_INVALID", "The uploaded file is not an allowed image."],
    ROOM_PARTICIPANT_REQUIRED: [403, "ROOM_PARTICIPANT_REQUIRED", "The sender and recipient must be active participants in this audio room."],
    RED_ENVELOPE_NOT_FOUND: [404, "RED_ENVELOPE_NOT_FOUND", "This red envelope was not found."],
    RED_ENVELOPE_NOT_READY: [409, "RED_ENVELOPE_NOT_READY", "This red envelope is not ready to claim yet."],
    RED_ENVELOPE_UNAVAILABLE: [409, "RED_ENVELOPE_UNAVAILABLE", "This red envelope is no longer available."],
    RED_ENVELOPE_ALREADY_CLAIMED: [409, "RED_ENVELOPE_ALREADY_CLAIMED", "You have already claimed this red envelope."],
    RED_ENVELOPE_DISABLED: [403, "RED_ENVELOPE_DISABLED", "Red Envelopes are currently disabled."],
    VALIDATION_ERROR: [
      422,
      "VALIDATION_ERROR",
      error.validationMessage ?? error.message,
    ],
    EXCHANGE_DISABLED: [403, "EXCHANGE_DISABLED", "Diamond exchange is disabled for this account."],
    EXCHANGE_BELOW_MINIMUM: [422, "EXCHANGE_BELOW_MINIMUM", "The amount is below the exchange minimum or cannot purchase one coin."],
    INSUFFICIENT_DIAMONDS: [409, "INSUFFICIENT_DIAMONDS", "Your diamond balance is insufficient."],
    IDEMPOTENCY_CONFLICT: [409, "IDEMPOTENCY_CONFLICT", "This idempotency key was already used with a different amount."],
  };
  const [status, code, message] = known[error?.code ?? error?.message] ?? [
    500,
    fallbackCode,
    "Unable to complete this request right now.",
  ];
  if (status === 401 && ["INVALID_SESSION", "SESSION_REVOKED"].includes(code))
    return mobileJson(mobileSessionError(code), status);
  return mobileJson({ success: false, error: { code, message } }, status);
}
