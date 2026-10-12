export const PORTAL_IDLE_SECONDS = 60 * 60;

export function updatePortalActivity(token, { signedIn = false, activity = false, now = Date.now() } = {}) {
  const last = signedIn ? now : (token.lastActivityAt ?? token.iat * 1000);
  if (!Number.isFinite(last) || now - last >= PORTAL_IDLE_SECONDS * 1000) return null;
  return { ...token, lastActivityAt: signedIn || activity ? now : last };
}
