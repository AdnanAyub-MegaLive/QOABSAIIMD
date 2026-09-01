import { prisma } from "./prisma";
import mobileSession from "./mobile-session.cjs";
import { assertMobileSession, mobileSessionError } from "./mobile-session-state";

export const mobileCorsHeaders = {
  "Access-Control-Allow-Origin": process.env.MOBILE_APP_ORIGIN || "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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
      status: true,
      deletedAt: true,
      sessionVersion: true,
      forcedLogoutAt: true,
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
  const known = {
    INVALID_SESSION: [401, "INVALID_SESSION", "The mobile session is invalid or expired."],
    SESSION_REVOKED: [401, "SESSION_REVOKED", "This mobile session has been revoked. Please sign in again."],
    INVALID_SESSION_TOKEN: [401, "INVALID_SESSION", "The mobile session is invalid or expired."],
    EXPIRED_SESSION_TOKEN: [401, "INVALID_SESSION", "The mobile session is invalid or expired."],
    DEVICE_NOT_REGISTERED: [401, "DEVICE_NOT_REGISTERED", "This session is not associated with an active device."],
    DEVICE_BANNED: [403, "DEVICE_BANNED", "This device has been banned."],
    ROLE_FORBIDDEN: [403, "ROLE_FORBIDDEN", "Your account does not have permission for this action."],
    USER_BLOCKED: [403, "USER_BLOCKED", "This action is unavailable because one of these users has blocked the other."],
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
    VALIDATION_ERROR: [
      422,
      "VALIDATION_ERROR",
      error.validationMessage ?? error.message,
    ],
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
