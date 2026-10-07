import { giftXpInput } from "@/lib/gift-xp-input";
import crypto from "node:crypto";
import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/portal-admin";
import { getLiveCommerceRule } from "@/lib/live-commerce";
import { validateProfitSplit } from "@/lib/profit-rules";
const safe = value => JSON.parse(JSON.stringify(value, (_, v) => typeof v === "bigint" ? String(v) : v));
function amount(value, positive = false) {
  const s = String(value ?? "");
  if (!/^\d{1,12}$/.test(s) || (positive && BigInt(s) === 0n)) throw Object.assign(new Error("Enter a valid coin amount."), { status: 422 });
  return BigInt(s);
}
function failure(e) { return Response.json({ success: false, error: { message: e.status ? e.message : "Unable to save live configuration." } }, { status: e.status || 500 }); }
export async function GET() {
  try {
    await requirePermission("video.view");
    const [rule, gifts] = await Promise.all([getLiveCommerceRule(), prisma.uploadAsset.findMany({ where: { category: "LIVE_GIFTS" }, select: { publicId: true, name: true, coinPrice: true, senderXp: true, receiverXp: true, active: true }, orderBy: { createdAt: "desc" } })]);
    return Response.json({ success: true, data: safe({ rule, gifts }) });
  } catch (e) { return failure(e); }
}
export async function POST(request) {
  try {
    const admin = await requirePermission("video.manage");
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await request.formData(), file = form.get("file"), name = String(form.get("name") || "").trim();
      if (!name || name.length > 120 || !(file instanceof File) || file.size > 5 * 1024 * 1024 || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw Object.assign(new Error("Provide a name and PNG, JPEG or WebP artwork up to 5 MB."), { status: 422 });
      let bytes;
      try { bytes = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 16000000 }).webp().toBuffer(); } catch { throw Object.assign(new Error("Invalid image artwork."), { status: 422 }); }
      const coinPrice = amount(form.get("coinPrice"), true);
      const xp=giftXpInput({senderXp:form.get("senderXp"),receiverXp:form.get("receiverXp")});
      await prisma.$transaction(async tx => {
        const asset = await tx.uploadAsset.create({ data: { publicId: `AST-${crypto.randomUUID()}`, name, category: "LIVE_GIFTS", fileName: "live-gift.webp", mimeType: "image/webp", fileSize: bytes.length, fileData: bytes, coinPrice, ...xp, giftTier: "CLASSIC", active: true, isGlobal: true } });
        await tx.auditLog.create({ data: { adminId: admin.id, action: "LIVE_GIFT_CREATED", category: "LIVE_MANAGEMENT", entityType: "UploadAsset", entityId: asset.publicId, description: "Created a live-only gift." } });
      });
    } else {
      const body = await request.json();
      if (body.action === "gift") {
        const name = String(body.name || "").trim();
        if (!name || name.length > 120 || typeof body.active !== "boolean") throw Object.assign(new Error("Invalid gift details."), { status: 422 });
        const coinPrice = amount(body.coinPrice, true);
        await prisma.$transaction(async tx => {
          const row = await tx.uploadAsset.updateMany({ where: { publicId: String(body.publicId), category: "LIVE_GIFTS" }, data: { name, coinPrice, ...giftXpInput(body), active: body.active } });
          if (!row.count) throw Object.assign(new Error("Live gift not found."), { status: 404 });
          await tx.auditLog.create({ data: { adminId: admin.id, action: "LIVE_GIFT_UPDATED", category: "LIVE_MANAGEMENT", entityType: "UploadAsset", entityId: body.publicId, description: "Updated live-only gift pricing or availability." } });
        });
      } else if (body.action === "rules") {
        let split;
        try { split = validateProfitSplit({ ...body, normalUserReusablePercent: 0 }); } catch { throw Object.assign(new Error("Host, agency and company shares must total 100%."), { status: 422 }); }
        if (typeof body.rewardsEnabled !== "boolean") throw Object.assign(new Error("Invalid reward setting."), { status: 422 });
        const targetCoins = amount(body.targetCoins, body.rewardsEnabled), rewardCoins = amount(body.rewardCoins, body.rewardsEnabled);
        await getLiveCommerceRule();
        await prisma.$transaction(async tx => {
          const { normalUserReusableShareBps: _unused, ...shares } = split;
          await tx.liveCommerceRule.update({ where: { id: "LIVE" }, data: { ...shares, rewardsEnabled: body.rewardsEnabled, targetCoins, rewardCoins, version: { increment: 1 } } });
          await tx.auditLog.create({ data: { adminId: admin.id, action: "LIVE_RULES_UPDATED", category: "LIVE_MANAGEMENT", entityType: "LiveCommerceRule", entityId: "LIVE", description: "Updated live-only settlement and gifting-target rewards." } });
        });
      } else throw Object.assign(new Error("Unknown action."), { status: 422 });
    }
    return Response.json({ success: true });
  } catch (e) { return failure(e); }
}
