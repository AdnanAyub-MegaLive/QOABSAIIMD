export function sessionInvalidation(user, payload) {
  if (!user) return "INVALID_SESSION";
  if (user.deletedAt || user.status !== "ACTIVE") return "SESSION_REVOKED";
  if (user.sessionVersion !== payload.sessionVersion) return "SESSION_REVOKED";
  if (
    user.forcedLogoutAt &&
    (!Number.isInteger(payload.issuedAt) ||
      payload.issuedAt <= user.forcedLogoutAt.getTime())
  )
    return "SESSION_REVOKED";
  return null;
}

export function assertMobileSession(user, payload) {
  const code = sessionInvalidation(user, payload);
  if (code) throw new Error(code);
  return user;
}

export function mobileSessionError(code = "INVALID_SESSION") {
  const revoked = code === "SESSION_REVOKED";
  return {
    success: false,
    error: {
      code: revoked ? "SESSION_REVOKED" : "INVALID_SESSION",
      message: revoked
        ? "This mobile session has been revoked. Please sign in again."
        : "The mobile session is invalid or expired.",
    },
  };
}
