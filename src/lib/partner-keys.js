import { createHash, randomBytes } from "node:crypto";

export const hashPartnerKey = (raw) => createHash("sha256").update(String(raw)).digest("hex");

export function generatePartnerKey() {
  const raw = `mpk_${randomBytes(32).toString("base64url")}`;
  return { raw, keyHash: hashPartnerKey(raw), keyPrefix: raw.slice(0, 12) };
}

function partnerError(code, message, status = 422) {
  return Object.assign(new Error(message), { code, status });
}

export function normalizeOrigin(value) {
  let url;
  try { url = new URL(String(value).trim()); } catch { throw partnerError("VALIDATION_ERROR", `Invalid website origin: ${value}`); }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (!(url.protocol === "https:" || (local && url.protocol === "http:")) || url.username || url.password)
    throw partnerError("VALIDATION_ERROR", `Website origin must use https: ${value}`);
  return url.origin;
}

export function normalizeOrigins(list) {
  const values = Array.isArray(list) ? list : String(list ?? "").split(/[\s,]+/);
  const origins = [...new Set(values.map((v) => String(v).trim()).filter(Boolean).map(normalizeOrigin))];
  if (origins.length > 20) throw partnerError("VALIDATION_ERROR", "At most 20 website origins are allowed.");
  return origins;
}

function cleanName(value) {
  const name = String(value ?? "").trim();
  if (!name || name.length > 80) throw partnerError("VALIDATION_ERROR", "Name is required (max 80 characters).");
  return name;
}

export function partnerKeyDto(key) {
  return {
    id: key.publicId,
    name: key.name,
    keyPrefix: key.keyPrefix,
    allowedOrigins: key.allowedOrigins ?? [],
    active: Boolean(key.active && !key.revokedAt),
    createdAt: key.createdAt?.toISOString?.() ?? null,
    revokedAt: key.revokedAt?.toISOString?.() ?? null,
    lastUsedAt: key.lastUsedAt?.toISOString?.() ?? null,
  };
}

export async function listPartnerKeys(db) {
  const keys = await db.partnerApiKey.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  return keys.map(partnerKeyDto);
}

export async function createPartnerKey(db, admin, input) {
  const name = cleanName(input?.name);
  const allowedOrigins = normalizeOrigins(input?.allowedOrigins ?? []);
  const { raw, keyHash, keyPrefix } = generatePartnerKey();
  const publicId = `PK-${randomBytes(6).toString("hex").toUpperCase()}`;
  const key = await db.$transaction(async (tx) => {
    const created = await tx.partnerApiKey.create({ data: { publicId, name, keyHash, keyPrefix, allowedOrigins, createdById: admin.id } });
    await tx.auditLog.create({ data: { adminId: admin.id, action: "CREATE_PARTNER_API_KEY", category: "PARTNER_API", entityType: "PartnerApiKey", entityId: created.id, description: `Created partner API key ${publicId} (${name})`, metadata: { publicId, keyPrefix, allowedOrigins } } });
    return created;
  });
  return { key: partnerKeyDto(key), rawKey: raw };
}

async function findKey(tx, publicId) {
  const key = await tx.partnerApiKey.findUnique({ where: { publicId: String(publicId ?? "") } });
  if (!key) throw partnerError("NOT_FOUND", "Partner key not found.", 404);
  return key;
}

export async function updatePartnerKeyOrigins(db, admin, publicId, input) {
  const allowedOrigins = normalizeOrigins(input?.allowedOrigins ?? []);
  return db.$transaction(async (tx) => {
    const key = await findKey(tx, publicId);
    const updated = await tx.partnerApiKey.update({ where: { id: key.id }, data: { allowedOrigins } });
    await tx.auditLog.create({ data: { adminId: admin.id, action: "UPDATE_PARTNER_API_KEY_ORIGINS", category: "PARTNER_API", entityType: "PartnerApiKey", entityId: key.id, description: `Updated website origins for partner API key ${key.publicId}`, metadata: { publicId: key.publicId, previous: key.allowedOrigins, allowedOrigins } } });
    return partnerKeyDto(updated);
  });
}

export async function revokePartnerKey(db, admin, publicId) {
  return db.$transaction(async (tx) => {
    const key = await findKey(tx, publicId);
    if (key.revokedAt) return partnerKeyDto(key);
    const updated = await tx.partnerApiKey.update({ where: { id: key.id }, data: { active: false, revokedAt: new Date() } });
    await tx.auditLog.create({ data: { adminId: admin.id, action: "REVOKE_PARTNER_API_KEY", category: "PARTNER_API", entityType: "PartnerApiKey", entityId: key.id, description: `Revoked partner API key ${key.publicId}`, metadata: { publicId: key.publicId, keyPrefix: key.keyPrefix } } });
    return partnerKeyDto(updated);
  });
}
