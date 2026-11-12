import { createHash } from "node:crypto";

export const credentialError = () => Object.assign(new Error("ID or password is incorrect."), { code: "INVALID_CREDENTIALS", status: 401 });

export function loginIdentifier(body) {
  // Never fall back to a different phone when an identifier was supplied.
  return String(body?.identifier?.trim?.() || body?.phone || "").trim();
}

export function identifierBucket(value) {
  const upper = value.toUpperCase();
  if (/^(?:USR-|TLN-)?\d+$/.test(upper)) return upper.replace(/^(USR|TLN)-/, "");
  return /^[+\d\s().-]+$/.test(upper) ? upper.replace(/[\s().-]/g, "") : upper;
}

export async function resolvePasswordLoginUser(db, identifier, now = new Date()) {
  if (!identifier || identifier.length > 255) return null;
  const special = await db.specialIdAssignment.findFirst({
    where: { specialId: { equals: identifier, mode: "insensitive" }, status: "ACTIVE", revokedAt: null, startsAt: { lte: now }, expiresAt: { gt: now } },
    select: { user: true }, orderBy: { id: "asc" },
  });
  if (special) return special.user;
  const exact = await db.user.findFirst({ where: { publicId: { equals: identifier, mode: "insensitive" } } });
  if (exact) return exact;
  const number = identifier.replace(/^(USR|TLN)-/i, "");
  if (/^\d+$/.test(number)) {
    const matches = await db.user.findMany({ where: { publicId: { in: [number, `USR-${number}`, `TLN-${number}`] } }, take: 2 });
    if (matches.length) return matches.length === 1 ? matches[0] : null;
  }
  const phone = identifier.replace(/[\s().-]/g, "");
  return db.user.findUnique({ where: { phone } });
}

// Reserve attempts atomically before checking credentials. Counting all attempts
// also bounds concurrent password checks and survives process restarts/workers.
export async function consumeAuthAttempts(db, keys, limit, windowSeconds) {
  let blocked = false;
  for (const key of [...new Set(keys)].sort()) {
    const digest = createHash("sha256").update(key).digest("hex");
    const rows = await db.$queryRaw`
      INSERT INTO "AuthAttemptBucket" ("key", "attempts", "expiresAt")
      VALUES (${digest}, 1, clock_timestamp() + ${windowSeconds} * interval '1 second')
      ON CONFLICT ("key") DO UPDATE SET
        "attempts" = CASE WHEN "AuthAttemptBucket"."expiresAt" <= clock_timestamp() THEN 1 ELSE LEAST("AuthAttemptBucket"."attempts" + 1, ${limit + 1}) END,
        "expiresAt" = CASE WHEN "AuthAttemptBucket"."expiresAt" <= clock_timestamp() THEN clock_timestamp() + ${windowSeconds} * interval '1 second' ELSE "AuthAttemptBucket"."expiresAt" END
      RETURNING "attempts"`;
    if (rows[0].attempts > limit) blocked = true;
  }
  await db.$executeRaw`DELETE FROM "AuthAttemptBucket" WHERE "expiresAt" < clock_timestamp() AND "key" IN (SELECT "key" FROM "AuthAttemptBucket" WHERE "expiresAt" < clock_timestamp() LIMIT 100)`;
  if (blocked) throw Object.assign(new Error("Too many attempts. Please try again later."), { code: "RATE_LIMITED", status: 429, retryAfter: windowSeconds });
}
