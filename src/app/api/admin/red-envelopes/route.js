import { auth } from "../../../../../auth";
import { prisma } from "@/lib/prisma";
import { getRedEnvelopeConfiguration } from "@/lib/red-envelopes";

const json = (body, status = 200) => Response.json(body, { status });

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.email) throw Object.assign(new Error("Authentication is required."), { status: 401 });
  const admin = await prisma.admin.findUnique({ where: { email: session.user.email } });
  if (!admin?.active) throw Object.assign(new Error("Administrator access is required."), { status: 403 });
  return admin;
}

function integer(value, field, min, max) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) throw Object.assign(new Error(`${field} must be between ${min} and ${max}.`), { status: 422 });
  return parsed;
}

function coins(value, field = "Coins") {
  const text = String(value ?? "").trim();
  if (!/^\d+$/.test(text) || BigInt(text) < 1n || BigInt(text) > 1_000_000_000n) throw Object.assign(new Error(`${field} must be between 1 and 1000000000.`), { status: 422 });
  return BigInt(text);
}

function presetData(body) {
  const name = String(body?.name ?? "").trim();
  if (!name || name.length > 60) throw Object.assign(new Error("Preset name must contain 1 to 60 characters."), { status: 422 });
  const totalCoins = coins(body.totalCoins, "Total coins");
  const shareCount = integer(body.shareCount, "Recipients", 1, 1000);
  if (totalCoins < BigInt(shareCount)) throw Object.assign(new Error("Total coins must provide at least one coin per recipient."), { status: 422 });
  return { name, totalCoins, shareCount, delaySeconds: integer(body.delaySeconds, "Delay", 0, 3600), sortOrder: integer(body.sortOrder ?? 0, "Sort order", 0, 1_000_000), active: body.active !== false };
}

async function audit(tx, admin, action, entityId, metadata) {
  await tx.auditLog.create({ data: { adminId: admin.id, action, category: "CONTENT_MANAGEMENT", entityType: "RedEnvelopeConfiguration", entityId, description: `${admin.name} changed Red Envelope configuration.`, metadata } });
}

export async function POST(request) {
  try {
    const admin = await requireAdmin();
    const body = await request.json();
    const id = `REDPRESET-${crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
    const data = presetData(body);
    await enforceCurrentLimits(data);
    await prisma.$transaction(async (tx) => { await tx.redEnvelopePreset.create({ data: { id, ...data } }); await audit(tx, admin, "RED_ENVELOPE_PRESET_CREATED", id, { ...data, totalCoins: data.totalCoins.toString() }); });
    return json({ success: true, data: await getRedEnvelopeConfiguration({ includeInactive: true }) }, 201);
  } catch (error) { return adminError(error); }
}

export async function PATCH(request) {
  try {
    const admin = await requireAdmin();
    const body = await request.json();
    if (body?.entity === "settings") {
      const data = { enabled: Boolean(body.enabled), maxCoins: coins(body.maxCoins, "Maximum pool"), maxShareCount: integer(body.maxShareCount, "Maximum recipients", 1, 1000), maxDelaySeconds: integer(body.maxDelaySeconds, "Maximum delay", 0, 3600), claimWindowSeconds: integer(body.claimWindowSeconds, "Claim window", 10, 86400) };
      const incompatible = await prisma.redEnvelopePreset.findFirst({ where: { active: true, OR: [{ totalCoins: { gt: data.maxCoins } }, { shareCount: { gt: data.maxShareCount } }, { delaySeconds: { gt: data.maxDelaySeconds } }] }, select: { name: true } });
      if (incompatible) throw Object.assign(new Error(`Update or disable the "${incompatible.name}" preset before lowering these limits.`), { status: 422 });
      await prisma.$transaction(async (tx) => { await tx.redEnvelopeSettings.upsert({ where: { id: "DEFAULT" }, create: { id: "DEFAULT", ...data }, update: data }); await audit(tx, admin, "RED_ENVELOPE_SETTINGS_UPDATED", "DEFAULT", { ...data, maxCoins: data.maxCoins.toString() }); });
    } else {
      const id = String(body?.id ?? "").trim();
      if (!id) throw Object.assign(new Error("Preset ID is required."), { status: 422 });
      const data = presetData(body);
      await enforceCurrentLimits(data);
      await prisma.$transaction(async (tx) => { await tx.redEnvelopePreset.update({ where: { id }, data }); await audit(tx, admin, "RED_ENVELOPE_PRESET_UPDATED", id, { ...data, totalCoins: data.totalCoins.toString() }); });
    }
    return json({ success: true, data: await getRedEnvelopeConfiguration({ includeInactive: true }) });
  } catch (error) { return adminError(error); }
}

async function enforceCurrentLimits(data) {
  if (!data.active) return;
  const settings = await prisma.redEnvelopeSettings.findUnique({ where: { id: "DEFAULT" } });
  if (!settings) return;
  if (data.totalCoins > settings.maxCoins) throw Object.assign(new Error("Preset coins exceed the configured maximum pool."), { status: 422 });
  if (data.shareCount > settings.maxShareCount) throw Object.assign(new Error("Preset recipients exceed the configured maximum."), { status: 422 });
  if (data.delaySeconds > settings.maxDelaySeconds) throw Object.assign(new Error("Preset countdown exceeds the configured maximum."), { status: 422 });
}

export async function DELETE(request) {
  try {
    const admin = await requireAdmin();
    const id = new URL(request.url).searchParams.get("id")?.trim();
    if (!id) throw Object.assign(new Error("Preset ID is required."), { status: 422 });
    await prisma.$transaction(async (tx) => { await tx.redEnvelopePreset.delete({ where: { id } }); await audit(tx, admin, "RED_ENVELOPE_PRESET_DELETED", id, {}); });
    return json({ success: true, data: await getRedEnvelopeConfiguration({ includeInactive: true }) });
  } catch (error) { return adminError(error); }
}

function adminError(error) {
  const status = error?.code === "P2025" ? 404 : error?.status ?? 500;
  if (status === 500) console.error("Red Envelope administration failed", error);
  return json({ success: false, error: { code: status === 401 ? "UNAUTHORIZED" : status === 403 ? "FORBIDDEN" : status === 404 ? "PRESET_NOT_FOUND" : status === 422 ? "VALIDATION_ERROR" : "RED_ENVELOPE_ADMIN_FAILED", message: status === 500 ? "Unable to save Red Envelope settings." : error.message } }, status);
}
