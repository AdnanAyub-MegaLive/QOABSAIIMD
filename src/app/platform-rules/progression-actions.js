"use server";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/portal-admin";
import { prisma } from "@/lib/prisma";
import { validateProgressionConfig, jsonSafe, levelSnapshot } from "@/lib/progression";
export async function publishProgression(input) {
  try {
  const admin=await requirePermission("rules.levels"),data=validateProgressionConfig(input);
  const ids=[...new Set(data.levels.map(l=>l.badgeAssetId).filter(Boolean))];
  if(ids.length!==await prisma.uploadAsset.count({where:{publicId:{in:ids},category:"BADGES",active:true}}))return {success:false,error:{code:"VALIDATION_ERROR",message:"Every level badge must be an active BADGES upload."}};
  const result=await prisma.$transaction(async tx=>{
    await tx.progressionConfiguration.updateMany({where:{active:true},data:{active:false}});
    const config=await tx.progressionConfiguration.create({data:{active:true,enabled:data.enabled,rules:data.rules,levels:{create:data.levels}}});
    const accounts=await tx.userProgress.findMany();
    for(const row of accounts){
      const snapshot=levelSnapshot(row,data.levels);
      await tx.userProgress.update({where:{userId_track:{userId:row.userId,track:row.track}},data:{configurationVersion:config.version,currentLevel:snapshot.level,revision:{increment:1}}});
    }
    await tx.auditLog.create({data:{adminId:admin.id,action:"PUBLISH_PROGRESSION_RULES",category:"USER_MANAGEMENT",entityType:"ProgressionConfiguration",entityId:String(config.version),description:"Published immutable progression configuration and applied thresholds to accounts while preserving earned XP.",metadata:jsonSafe(data)}});
    return config.version;
  },{isolationLevel:"Serializable"});
  revalidatePath("/platform-rules");return {success:true,version:result};
  } catch(error) {
    if (["VALIDATION_ERROR","UNAUTHORIZED","FORBIDDEN"].includes(error.code)) return {success:false,error:{code:error.code,message:error.message,...(error.fields?{fields:error.fields}:{})}};
    if(error.code==="P2034") return {success:false,error:{code:"CONFLICT",message:"Another update occurred. Refresh the page and review the latest levels before saving again."}};
    console.error("Progression rules publish failed",error);
    return {success:false,error:{code:"PROGRESSION_SAVE_FAILED",message:"Unable to save level rules. Please retry. If this continues, contact support with the time of the attempt."}};
  }
}
