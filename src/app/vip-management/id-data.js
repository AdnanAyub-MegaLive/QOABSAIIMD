import { prisma } from "@/lib/prisma";
import { reconcileExpiredSpecialIds } from "@/lib/special-id";

export async function loadVipIdData() {
  await reconcileExpiredSpecialIds();
  const [users, definitions] = await Promise.all([
    prisma.user.findMany({where:{deletedAt:null},select:{publicId:true,name:true,specialIds:{include:{definition:true},orderBy:{createdAt:"desc"}}}}),
    prisma.specialIdDefinition.findMany({where:{active:true},include:{assignments:{where:{status:"ACTIVE",revokedAt:null,expiresAt:{gt:new Date()}},include:{user:true}}}}),
  ]);
  return {
    assignments:users.flatMap(user=>user.specialIds.map(item=>({id:item.id,userId:user.publicId,user:user.name,specialId:item.specialId,category:item.definition?.category??"LEGACY",source:item.source,status:item.status,durationMinutes:item.expiresAt?Math.max(1,Math.round((item.expiresAt-item.startsAt)/60000)):null,starts:item.startsAt.toLocaleString("en-US"),expires:item.expiresAt?.toLocaleString("en-US")??"Legacy"}))),
    catalog:definitions.map(item=>({id:item.id,code:item.code,category:item.category,minimumVipLevel:item.minimumVipLevel,minimumTopUpAmount:Number(item.minimumTopUpAmount??0),defaultDurationMinutes:item.defaultDurationMinutes,active:item.active,assignedTo:item.assignments[0]?.user.publicId??null,expiresAt:item.assignments[0]?.expiresAt?.toISOString()??null})),
  };
}
