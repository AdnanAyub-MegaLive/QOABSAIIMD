import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/portal-admin";
import { sameOrigin, jsonBody } from "@/lib/game-control/http";
import { validateActivityRule } from "@/lib/activity-levels";
const failure=e=>Response.json({success:false,error:{message:e.status?e.message:"Unable to save level rules."}},{status:e.status??500});
export async function GET(){try{await requirePermission("rules.view");return Response.json({success:true,data:await prisma.activityLevelRule.findMany()});}catch(e){return failure(e);}}
export async function PUT(request){try{const admin=await requirePermission("rules.levels");sameOrigin(request);const body=await jsonBody(request),rule=validateActivityRule(body);if(!Number.isSafeInteger(body.revision)||body.revision<0)throw Object.assign(new Error("Invalid revision."),{status:422});
 const data=await prisma.$transaction(async tx=>{
  for(const level of rule.levels)if(level.badgeAssetId&&!await tx.uploadAsset.findFirst({where:{publicId:level.badgeAssetId,active:true,mimeType:{in:["image/png","image/jpeg","image/webp","image/gif"]}}}))throw Object.assign(new Error("Choose an active image asset for each badge."),{status:422});
  await tx.activityLevelRule.upsert({where:{track:rule.track},create:{track:rule.track,levels:[{level:0,threshold:"0",badgeAssetId:null}]},update:{}});
  const changed=await tx.activityLevelRule.updateMany({where:{track:rule.track,revision:body.revision},data:{...rule,revision:{increment:1}}});if(!changed.count)throw Object.assign(new Error("Rules changed; reload first."),{status:409});
  await tx.auditLog.create({data:{adminId:admin.id,action:"ACTIVITY_LEVEL_RULE_UPDATED",category:"USER_MANAGEMENT",entityType:"ActivityLevelRule",entityId:rule.track,description:"Updated prospective XP rate and display thresholds.",metadata:{previousRevision:body.revision,...rule}}});return tx.activityLevelRule.findUnique({where:{track:rule.track}});
 });return Response.json({success:true,data});}catch(e){return failure(e);}}
