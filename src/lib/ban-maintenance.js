import "server-only";
import { prisma } from "./prisma";

export async function reconcileExpiredBans() {
  const now=new Date();
  const expired=await prisma.ban.findMany({where:{revokedAt:null,expiresAt:{lte:now}},select:{id:true,userId:true,talentId:true,deviceId:true}});
  if(!expired.length)return;
  await prisma.ban.updateMany({where:{id:{in:expired.map((ban)=>ban.id)}},data:{revokedAt:now}});
  const userIds=[...new Set(expired.flatMap((ban)=>ban.userId?[ban.userId]:[]))];
  const talentIds=[...new Set(expired.flatMap((ban)=>ban.talentId?[ban.talentId]:[]))];
  const deviceIds=[...new Set(expired.flatMap((ban)=>ban.deviceId?[ban.deviceId]:[]))];
  for(const userId of userIds)if(!await prisma.ban.count({where:{userId,target:"USER",revokedAt:null,OR:[{expiresAt:null},{expiresAt:{gt:now}}]}}))await prisma.user.update({where:{id:userId},data:{status:"ACTIVE"}});
  for(const talentId of talentIds)if(!await prisma.ban.count({where:{talentId,target:"USER",revokedAt:null,OR:[{expiresAt:null},{expiresAt:{gt:now}}]}}))await prisma.talent.update({where:{id:talentId},data:{status:"ACTIVE"}});
  for(const deviceId of deviceIds)if(!await prisma.ban.count({where:{deviceId,target:"DEVICE",revokedAt:null,OR:[{expiresAt:null},{expiresAt:{gt:now}}]}}))await prisma.device.update({where:{id:deviceId},data:{isBanned:false}});
}
