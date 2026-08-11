import { prisma } from "./prisma";
import mobileSession from "./mobile-session.cjs";

export const mobileCorsHeaders = {
  "Access-Control-Allow-Origin": process.env.MOBILE_APP_ORIGIN || "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
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
      profileImage: true,
      gender: true,
      dob: true,
      isVerified: true,
      isOfficial: true,
      deletedAt: true,
      sessionVersion: true,
    },
  });
  if (
    !user ||
    user.deletedAt ||
    user.sessionVersion !== payload.sessionVersion
  )
    throw new Error("INVALID_SESSION");
  return user;
}

export function mobileApiError(error, fallbackCode = "REQUEST_FAILED") {
  const known = {
    INVALID_SESSION: [401, "INVALID_SESSION", "The mobile session is invalid or expired."],
    INVALID_SESSION_TOKEN: [401, "INVALID_SESSION", "The mobile session is invalid or expired."],
    EXPIRED_SESSION_TOKEN: [401, "INVALID_SESSION", "The mobile session is invalid or expired."],
    CONVERSATION_NOT_FOUND: [404, "CONVERSATION_NOT_FOUND", "Conversation not found."],
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
    INSUFFICIENT_SALARY: [409, "INSUFFICIENT_SALARY", "Your host salary balance is too low for this withdrawal."],
    COIN_PACKAGE_NOT_FOUND: [404, "COIN_PACKAGE_NOT_FOUND", "The selected coin package is unavailable."],
    PAYMENT_METHOD_NOT_SUPPORTED: [422, "PAYMENT_METHOD_NOT_SUPPORTED", "The selected payment method is not supported."],
    PAYMENT_PROVIDER_NOT_CONFIGURED: [503, "PAYMENT_PROVIDER_NOT_CONFIGURED", "The payment provider is not configured yet."],
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
  return mobileJson({ success: false, error: { code, message } }, status);
}
