export function bannedAccountLoginResponse(ban) {
  return {
    success: false,
    error: {
      code: "ACCOUNT_BANNED",
      message: "This account has been banned.",
      details: {
        reason: ban?.reason ?? null,
        expiresAt: ban?.expiresAt?.toISOString() ?? null,
      },
    },
  };
}
