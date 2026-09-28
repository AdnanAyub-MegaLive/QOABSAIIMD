import { prisma } from "@/lib/prisma";
import { requirePortalAdmin } from "@/lib/portal-admin";
import { getCustomBackgroundConfiguration } from "@/lib/custom-room-backgrounds";

const json = (body, status = 200) => Response.json(body, { status });
const fail = (error) => json({ success: false, error: { code: error?.status === 422 ? "VALIDATION_ERROR" : error?.status === 401 ? "UNAUTHORIZED" : "CUSTOM_BACKGROUND_ADMIN_FAILED", message: error?.status ? error.message : "Unable to save custom background settings." } }, error?.status ?? 500);
const integer = (value, label, min, max) => { const n = Number(value); if (!Number.isSafeInteger(n) || n < min || n > max) throw Object.assign(new Error(`${label} must be between ${min} and ${max}.`), { status: 422 }); return n; };
const coins = (value) => { const text = String(value ?? ""); if (!/^\d+$/.test(text) || BigInt(text) < 1n) throw Object.assign(new Error("Coins must be a positive whole number."), { status: 422 }); return BigInt(text); };
async function admin() { const value = await requirePortalAdmin(); if (!value) throw Object.assign(new Error("Administrator access is required."), { status: 401 }); return value; }

export async function GET() {
  try {
    await admin();
    const [configuration, requests] = await Promise.all([getCustomBackgroundConfiguration({ includeInactive: true }), prisma.customRoomBackgroundRequest.findMany({ include: { user: { select: { publicId: true, name: true, profileImage: true } }, reviewedBy: { select: { name: true } }, approvedAsset: { select: { publicId: true } } }, orderBy: { submittedAt: "desc" }, take: 200 })]);
    return json({ success: true, data: { ...configuration, requests: requests.map((item) => ({ id: item.publicId, status: item.status, user: item.user, priceName: item.priceName, durationDays: item.durationDays, coins: item.coins.toString(), mimeType: item.mimeType, fileSize: item.fileSize, submittedAt: item.submittedAt.toISOString(), reviewedAt: item.reviewedAt?.toISOString() ?? null, reviewedBy: item.reviewedBy?.name ?? null, rejectionReason: item.rejectionReason, assetId: item.approvedAsset?.publicId ?? null, previewUrl: `/api/room-backgrounds/custom/${item.publicId}/preview` })) } });
  } catch (error) { return fail(error); }
}

export async function POST(request) {
  try {
    const actor = await admin(); const body = await request.json();
    const name = String(body.name ?? "").trim(); if (!name || name.length > 60) throw Object.assign(new Error("Package name must contain 1 to 60 characters."), { status: 422 });
    const id = `PRICE-${crypto.randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}`;
    const data = { name, durationDays: integer(body.durationDays, "Duration", 1, 3650), coins: coins(body.coins), sortOrder: integer(body.sortOrder ?? 0, "Sort order", 0, 1000000), active: body.active !== false };
    await prisma.$transaction(async (tx) => { await tx.customRoomBackgroundPrice.create({ data: { id, ...data } }); await tx.auditLog.create({ data: { adminId: actor.id, action: "CUSTOM_BACKGROUND_PRICE_CREATED", category: "CONTENT_MANAGEMENT", entityType: "CustomRoomBackgroundPrice", entityId: id, description: `${actor.name} created custom background package ${name}.`, metadata: { ...data, coins: data.coins.toString() } } }); });
    return json({ success: true, data: await getCustomBackgroundConfiguration({ includeInactive: true }) }, 201);
  } catch (error) { return fail(error); }
}

export async function PATCH(request) {
  try {
    const actor = await admin(); const body = await request.json();
    if (body.entity === "settings") {
      const allowedMimeTypes = Array.isArray(body.mimeTypes) ? body.mimeTypes.filter((v) => ["image/jpeg", "image/png", "image/webp"].includes(v)) : [];
      if (!allowedMimeTypes.length) throw Object.assign(new Error("Select at least one allowed image type."), { status: 422 });
      const data = { enabled: Boolean(body.enabled), maxBytes: integer(body.maxBytes, "Maximum upload bytes", 1024, 25_000_000), allowedMimeTypes };
      await prisma.$transaction(async (tx) => { await tx.customRoomBackgroundSettings.upsert({ where: { id: "DEFAULT" }, create: { id: "DEFAULT", ...data }, update: data }); await tx.auditLog.create({ data: { adminId: actor.id, action: "CUSTOM_BACKGROUND_SETTINGS_UPDATED", category: "CONTENT_MANAGEMENT", entityType: "CustomRoomBackgroundSettings", entityId: "DEFAULT", description: `${actor.name} updated custom background settings.`, metadata: data } }); });
    } else {
      const id = String(body.id ?? ""); const name = String(body.name ?? "").trim(); if (!id || !name) throw Object.assign(new Error("Package ID and name are required."), { status: 422 });
      const data = { name, durationDays: integer(body.durationDays, "Duration", 1, 3650), coins: coins(body.coins), sortOrder: integer(body.sortOrder ?? 0, "Sort order", 0, 1000000), active: body.active !== false };
      await prisma.$transaction(async (tx) => { await tx.customRoomBackgroundPrice.update({ where: { id }, data }); await tx.auditLog.create({ data: { adminId: actor.id, action: "CUSTOM_BACKGROUND_PRICE_UPDATED", category: "CONTENT_MANAGEMENT", entityType: "CustomRoomBackgroundPrice", entityId: id, description: `${actor.name} updated custom background package ${name}.`, metadata: { ...data, coins: data.coins.toString() } } }); });
    }
    return json({ success: true, data: await getCustomBackgroundConfiguration({ includeInactive: true }) });
  } catch (error) { return fail(error); }
}
