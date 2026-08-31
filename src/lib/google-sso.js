import { OAuth2Client } from "google-auth-library";

let googleClient;

function googleSsoError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function configuredAudiences() {
  const values = String(
    process.env.GOOGLE_OAUTH_CLIENT_IDS ?? process.env.GOOGLE_OAUTH_CLIENT_ID ?? "",
  )
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!values.length) {
    throw googleSsoError(
      "GOOGLE_SSO_NOT_CONFIGURED",
      "Google sign-in is not configured on this server.",
    );
  }
  return values;
}

function validProfileImage(value) {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? value : null;
  } catch {
    return null;
  }
}

export function googleProfileFromPayload(payload) {
  const subject = typeof payload?.sub === "string" ? payload.sub.trim() : "";
  const email = typeof payload?.email === "string"
    ? payload.email.trim().toLowerCase()
    : "";
  if (!subject || subject.length > 255 || !email || email.length > 254) {
    throw googleSsoError("GOOGLE_ID_TOKEN_INVALID", "The Google ID token is invalid.");
  }
  if (payload.email_verified !== true) {
    throw googleSsoError(
      "GOOGLE_EMAIL_UNVERIFIED",
      "Google must verify the email address before it can be used to sign in.",
    );
  }

  const fallbackName = email.split("@")[0]?.replace(/[._-]+/g, " ").trim() || "MegaLive User";
  const suppliedName = typeof payload.name === "string" ? payload.name.trim() : "";
  const name = (suppliedName.length >= 2 ? suppliedName : fallbackName).slice(0, 100);
  const hostedDomain = typeof payload.hd === "string" ? payload.hd.trim().toLowerCase() : null;

  return {
    subject,
    email,
    name: name.length >= 2 ? name : "MegaLive User",
    profileImage: validProfileImage(payload.picture),
    // Google documents Gmail and verified Workspace accounts as authoritative
    // email sources. Other addresses must be linked from an authenticated account.
    emailAuthoritative: email.endsWith("@gmail.com") || Boolean(hostedDomain),
  };
}

export async function verifyGoogleIdToken(idToken) {
  if (typeof idToken !== "string" || !idToken.trim() || idToken.length > 16_384) {
    throw googleSsoError("GOOGLE_ID_TOKEN_REQUIRED", "A Google ID token is required.");
  }
  try {
    googleClient ??= new OAuth2Client();
    const ticket = await googleClient.verifyIdToken({
      idToken: idToken.trim(),
      audience: configuredAudiences(),
    });
    return googleProfileFromPayload(ticket.getPayload());
  } catch (error) {
    if (error?.code?.startsWith("GOOGLE_")) throw error;
    throw googleSsoError("GOOGLE_ID_TOKEN_INVALID", "The Google ID token is invalid or expired.");
  }
}
