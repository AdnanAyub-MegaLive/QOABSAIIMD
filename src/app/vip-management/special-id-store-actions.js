"use server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/portal-admin";
import { revalidatePath } from "next/cache";
export async function configureSpecialIdStore(id, price, duration, visible) {
  const admin = await requirePermission("users.specialIds");
  const minutes = Number(duration);
  if (!/^[1-9][0-9]{0,18}$/.test(String(price)) || BigInt(price) > 9223372036854775807n || !Number.isSafeInteger(minutes) || minutes < 1 || minutes > 52560000 || typeof visible !== "boolean")
    return { success: false, message: "Enter a positive Coin price and duration (up to 100 years)." };
  await prisma.$transaction(async tx => {
    await tx.specialIdDefinition.update({ where: { id }, data: { coinPrice: BigInt(price), defaultDurationMinutes: minutes, storeVisible: visible } });
    await tx.auditLog.create({ data: { action: "SPECIAL_ID_STORE_CONFIGURED", category: "USER_MANAGEMENT", entityType: "SpecialId", entityId: id, description: "Special ID store settings updated", metadata: { adminId: admin.id, price: String(price), durationMinutes: minutes, storeVisible: visible } } });
  });
  revalidatePath("/vip-management");
  return { success: true };
}
