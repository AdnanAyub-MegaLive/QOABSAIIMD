"use server";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/portal-admin";
import { prisma } from "@/lib/prisma";
import { parsePositiveCoins } from "@/lib/wallet";

export async function saveExchangeSettings(input) {
  const admin = await requirePermission("rules.manage");
  const diamondsPerCoin = parsePositiveCoins(input.diamondsPerCoin);
  const minDiamonds = parsePositiveCoins(input.minDiamonds);
  if (typeof input.enabled !== "boolean" || diamondsPerCoin > 9223372036854775807n || minDiamonds > 9223372036854775807n) throw new Error("Invalid exchange settings.");
  await prisma.$transaction(async tx => {
    const data = { enabled: input.enabled, diamondsPerCoin, minDiamonds };
    await tx.diamondExchangeSettings.upsert({ where: { id: "GLOBAL" }, create: { id: "GLOBAL", ...data }, update: data });
    await tx.auditLog.create({ data: { adminId: admin.id, action: "UPDATE_DIAMOND_EXCHANGE", category: "FINANCE", entityType: "DiamondExchangeSettings", entityId: "GLOBAL", description: "Updated diamond exchange rate and availability.", metadata: { ...input, diamondsPerCoin: diamondsPerCoin.toString(), minDiamonds: minDiamonds.toString() } } });
  });
  revalidatePath("/platform-rules");
}

export async function setUserExchangeAccess(input) {
  const admin = await requirePermission("rules.manage");
  if (typeof input.enabled !== "boolean" || !String(input.publicId ?? "").trim()) throw new Error("Enter a valid user ID.");
  await prisma.$transaction(async tx => {
    const user = await tx.user.update({ where: { publicId: input.publicId.trim() }, data: { diamondExchangeEnabled: input.enabled } });
    await tx.auditLog.create({ data: { adminId: admin.id, action: "UPDATE_USER_DIAMOND_EXCHANGE", category: "FINANCE", entityType: "User", entityId: user.publicId, description: `${input.enabled ? "Enabled" : "Disabled"} diamond exchange for ${user.publicId}.` } });
  });
  revalidatePath("/platform-rules");
}
