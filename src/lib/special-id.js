import { prisma } from "./prisma.js";

export function normalizeSpecialId(value) {
  const code=String(value??"").trim().toUpperCase();
  if(!/^[A-Z0-9]{4,7}$/.test(code))throw new Error("SPECIAL_ID_MUST_BE_4_TO_7_CHARACTERS");
  return code;
}

export async function reconcileExpiredSpecialIds() {
  return prisma.specialIdAssignment.updateMany({
    where:{status:"ACTIVE",expiresAt:{lte:new Date()}},
    data:{status:"EXPIRED"},
  });
}

export async function getEffectiveUserId(userId, publicId) {
  const assignment=await prisma.specialIdAssignment.findFirst({
    where:{userId,status:"ACTIVE",revokedAt:null,expiresAt:{gt:new Date()}},
    orderBy:{expiresAt:"desc"},
  });
  return {normalId:publicId,effectiveId:assignment?.specialId??publicId,specialId:assignment?.specialId??null,specialIdExpiresAt:assignment?.expiresAt??null};
}

export async function assignDefinitionToUser({publicId,definitionId,durationMinutes,source="ADMIN"}) {
  await reconcileExpiredSpecialIds();
  const user=await prisma.user.findUniqueOrThrow({where:{publicId}});
  const definition=await prisma.specialIdDefinition.findUniqueOrThrow({where:{id:definitionId}});
  if(!definition.active)throw new Error("SPECIAL_ID_IS_DISABLED");
  const occupied=await prisma.specialIdAssignment.findFirst({where:{definitionId,status:"ACTIVE",revokedAt:null,expiresAt:{gt:new Date()}}});
  if(occupied)throw new Error("SPECIAL_ID_ALREADY_ASSIGNED");
  const minutes=Number(durationMinutes||definition.defaultDurationMinutes);
  if(!Number.isInteger(minutes)||minutes<1)throw new Error("INVALID_SPECIAL_ID_DURATION");
  const now=new Date();
  const assignment=await prisma.$transaction(async(tx)=>{
    await tx.specialIdAssignment.updateMany({where:{userId:user.id,status:"ACTIVE"},data:{status:"REPLACED",revokedAt:now}});
    return tx.specialIdAssignment.create({data:{userId:user.id,definitionId:definition.id,specialId:definition.code,status:"ACTIVE",source,startsAt:now,expiresAt:new Date(now.getTime()+minutes*60000)}});
  });
  globalThis.portalScheduleSpecialIdExpiry?.(assignment.id,assignment.expiresAt);
  return assignment;
}

export async function autoAssignEligibleSpecialId(publicId, source) {
  await reconcileExpiredSpecialIds();
  const user=await prisma.user.findUniqueOrThrow({where:{publicId},include:{specialIds:{where:{status:"ACTIVE",revokedAt:null,expiresAt:{gt:new Date()}},take:1}}});
  if(user.specialIds.length)return user.specialIds[0];
  const definitions=await prisma.specialIdDefinition.findMany({where:{active:true,category:{in:["VIP","SVIP"]}},orderBy:[{minimumVipLevel:"desc"},{minimumTopUpAmount:"desc"},{createdAt:"asc"}]});
  for(const definition of definitions){
    const vipEligible=definition.minimumVipLevel!==null&&user.vipLevel>=definition.minimumVipLevel;
    const topUpEligible=definition.minimumTopUpAmount!==null&&user.totalTopUp>=definition.minimumTopUpAmount;
    if(!vipEligible&&!topUpEligible)continue;
    const occupied=await prisma.specialIdAssignment.findFirst({where:{definitionId:definition.id,status:"ACTIVE",revokedAt:null,expiresAt:{gt:new Date()}}});
    if(!occupied)return assignDefinitionToUser({publicId,definitionId:definition.id,source});
  }
  return null;
}
