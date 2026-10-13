import { randomUUID } from "node:crypto";
import { parsePhoneNumberFromString } from "libphonenumber-js/max";
import { connectionError, connectionStatus, normalizeConnectionPhone, validateConnectionPassword, phoneVerificationProvider } from "./account-connection-policy.js";

// Serialize changes on the existing account. Never create an account or session here.
export async function withConnectionUser(db, identity, operation) {
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${identity.id} FOR UPDATE`;
    const user = await tx.user.findUnique({ where: { id: identity.id } });
    if (!user || user.deletedAt || user.status !== "ACTIVE" || user.sessionVersion !== identity.sessionVersion)
      throw connectionError("SESSION_REVOKED", "Please sign in again.", 401);
    const ban = await tx.ban.findFirst({ where: { userId: user.id, target: "USER", revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } });
    if (ban) throw connectionError("ACCOUNT_BANNED", "This account has been banned.", 403);
    return operation(tx, user);
  });
}
export async function consumeConnectionRequest(db, identity, now = new Date()) {
  return withConnectionUser(db, identity, async tx => {
    const state = await tx.accountConnectionState.upsert({ where: { userId: identity.id }, create: { userId: identity.id }, update: {} });
    const fresh = now - state.windowAt >= 600000;
    if (!fresh && state.requestCount >= 10) throw connectionError("RATE_LIMITED", "Too many connection requests. Try again in 10 minutes.", 429);
    await tx.accountConnectionState.update({ where: { userId: identity.id }, data: { windowAt: fresh ? now : state.windowAt, requestCount: fresh ? 1 : state.requestCount + 1 } });
  });
}
async function audit(tx, user, action) {
  await tx.auditLog.create({ data: { action, category: "AUTHENTICATION", entityType: "User", entityId: user.publicId, description: `${action === "ACCOUNT_GOOGLE_LINKED" ? "Google" : "Phone"} login connected to existing account.` } });
}
export async function linkGoogle(db, identity, profile) {
  try {
    return await withConnectionUser(db, identity, async (tx, user) => {
      if (user.googleSubject && user.googleSubject !== profile.subject) throw connectionError("GOOGLE_ALREADY_CONNECTED", "This account already has a different Google identity connected.", 409);
      const conflict = await tx.user.findFirst({ where: { id: { not: user.id }, OR: [{ googleSubject: profile.subject }, { email: { equals: profile.email, mode: "insensitive" } }, { googleEmail: { equals: profile.email, mode: "insensitive" } }] }, select: { id: true } });
      if (conflict) throw connectionError("GOOGLE_ACCOUNT_ALREADY_CONNECTED", "This Google identity or email belongs to another account.", 409);
      if (user.googleSubject === profile.subject && user.email === profile.email && user.googleEmail === profile.email) return connectionStatus(user);
      const updated = await tx.user.update({ where: { id: user.id }, data: { googleSubject: profile.subject, googleEmail: profile.email, email: profile.email } });
      await audit(tx, user, "ACCOUNT_GOOGLE_LINKED");
      return connectionStatus(updated);
    });
  } catch (error) {
    if (error.code === "P2002") throw connectionError("GOOGLE_ACCOUNT_ALREADY_CONNECTED", "This Google identity or email belongs to another account.", 409);
    throw error;
  }
}
async function ensurePhoneAvailable(tx, user, phone) {
  if (user.phone && user.passwordHash) throw connectionError("PHONE_ALREADY_CONNECTED", "Phone login is already connected. Use account recovery to change it.", 409);
  // Also recognize common legacy international numbers stored without '+'.
  const other = await tx.user.findFirst({ where: { id: { not: user.id }, phone: { in: [phone, phone.slice(1)] } }, select: { id: true } });
  if (other) throw connectionError("PHONE_ALREADY_CONNECTED_ELSEWHERE", "This phone number belongs to another account.", 409);
  const parsed = parsePhoneNumberFromString(phone);
  const legacy = await tx.$queryRaw`SELECT id FROM "User" WHERE id <> ${user.id} AND (
    regexp_replace(phone, '[^0-9]', '', 'g') = ${phone.slice(1)} OR
    (country = ${parsed.country} AND regexp_replace(phone, '[^0-9]', '', 'g') IN (${parsed.nationalNumber}, ${"0" + parsed.nationalNumber}))
  ) LIMIT 1`;
  if (legacy.length) throw connectionError("PHONE_ALREADY_CONNECTED_ELSEWHERE", "This phone number belongs to another account.", 409);
}
export async function requestPhoneConnection(db, identity, input, provider = phoneVerificationProvider()) {
  const phone = normalizeConnectionPhone(input.phone, input.country);
  return withConnectionUser(db, identity, async (tx, user) => {
    await ensurePhoneAvailable(tx, user, phone);
    const old = await tx.accountConnectionState.findUnique({ where: { userId: user.id } });
    const now = new Date();
    if (old?.expiresAt && old.expiresAt.getTime() - now.getTime() > 240000) throw connectionError("RATE_LIMITED", "Wait 60 seconds before requesting another code.", 429);
    const challengeId = randomUUID(); const expiresAt = new Date(now.getTime() + 300000);
    await provider.send({ phone, challengeId });
    await tx.accountConnectionState.upsert({ where: { userId: user.id }, create: { userId: user.id, challengeId, phone, provider: provider.name, sessionVersion: user.sessionVersion, expiresAt }, update: { challengeId, phone, provider: provider.name, sessionVersion: user.sessionVersion, expiresAt, attempts: 0, consumedAt: null } });
    return { challengeId, expiresAt: expiresAt.toISOString(), delivery: provider.delivery, maskedPhone: connectionStatus({ phone }).maskedPhone };
  });
}
export async function confirmPhoneConnection(db, identity, input, hashPassword, provider = phoneVerificationProvider()) {
  validateConnectionPassword(input.password);
  // Hash outside the transaction to keep account lock duration short.
  const passwordHash = await hashPassword(input.password);
  try {
    const result = await withConnectionUser(db, identity, async (tx, user) => {
      const state = await tx.accountConnectionState.findUnique({ where: { userId: user.id } });
      if (!state || !input.challengeId || state.challengeId !== input.challengeId || state.sessionVersion !== user.sessionVersion || state.provider !== provider.name || !state.expiresAt || state.expiresAt <= new Date())
        throw connectionError("OTP_EXPIRED", "Request a new verification code.");
      if (state.consumedAt) return { data: connectionStatus(user) };
      if (state.attempts >= 5) throw connectionError("OTP_ATTEMPTS_EXCEEDED", "Too many incorrect codes. Request a new code.", 429);
      const correct = await provider.verify(input.otp, { phone: state.phone, challengeId: state.challengeId });
      await tx.accountConnectionState.update({ where: { userId: user.id }, data: { attempts: { increment: 1 } } });
      // Return errors after commit so failed attempts cannot be rolled back.
      if (!correct) return { incorrect: true };
      await ensurePhoneAvailable(tx, user, state.phone);
      const updated = await tx.user.update({ where: { id: user.id }, data: { phone: state.phone, passwordHash } });
      await tx.accountConnectionState.update({ where: { userId: user.id }, data: { consumedAt: new Date() } });
      await audit(tx, user, "ACCOUNT_PHONE_LINKED");
      return { data: connectionStatus(updated) };
    });
    if (result.incorrect) throw connectionError("OTP_INCORRECT", "The verification code is incorrect.");
    return result.data;
  } catch (error) {
    if (error.code === "P2002") throw connectionError("PHONE_ALREADY_CONNECTED_ELSEWHERE", "This phone number belongs to another account.", 409);
    throw error;
  }
}
