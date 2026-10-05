"use server";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/portal-admin";
import { prisma } from "@/lib/prisma";
import { validateProgressionConfig, jsonSafe } from "@/lib/progression";
export async function publishProgression(input) {
  const admin=await requirePermission("rules.manage"),data=validateProgressionConfig(input);
  const ids=[...new Set(data.levels.map(l=>l.badgeAssetId).filter(Boolean))];
  if(ids.length!==await prisma.uploadAsset.count({where:{publicId:{in:ids},category:"BADGES",active:true}}))throw new Error("Every level badge must be an active BADGES upload.");
  const result=await prisma.$transaction(async tx=>{
    await tx.progressionConfiguration.updateMany({where:{active:true},data:{active:false}});
    const config=await tx.progressionConfiguration.create({data:{active:true,enabled:data.enabled,rules:data.rules,levels:{create:data.levels}}});
    await tx.auditLog.create({data:{adminId:admin.id,action:"PUBLISH_PROGRESSION_RULES",category:"USER_MANAGEMENT",entityType:"ProgressionConfiguration",entityId:String(config.version),description:"Published immutable progression configuration; existing accounts retain their version.",metadata:jsonSafe(data)}});
    return config.version;
  },{isolationLevel:"Serializable"});
  revalidatePath("/platform-rules");return {version:result};
}
