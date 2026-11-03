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

export async function grantPrettyId(publicId, pattern, durationMinutes) {
  const admin = await requirePermission("users.specialIds");
  if (typeof publicId !== "string" || !publicId.trim() || !/^[A-G]{7}$/.test(pattern) || !Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 52560000)
    return {success:false,message:"Enter the normal user ID, a seven-letter format (A–G), and a positive duration."};
  const user = await prisma.user.findFirst({where:{publicId:publicId.trim(),status:"ACTIVE",deletedAt:null},select:{id:true}});
  if (!user) return {success:false,message:"Active user not found. Enter their normal account ID."};
  await prisma.$transaction(async tx=>{
    const grant = await tx.prettyIdGrant.create({data:{userId:user.id,pattern,durationMinutes}});
    await tx.auditLog.create({data:{action:"PRETTY_ID_GRANTED",category:"USER_MANAGEMENT",entityType:"User",entityId:user.id,description:"Pretty ID format granted",metadata:{grantId:grant.id,adminId:admin.id,pattern,durationMinutes}}});
  });
  return {success:true,message:"Entitlement granted. The user can choose an ID in the app."};
}
