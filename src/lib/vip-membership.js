import { prisma } from "./prisma.js";
import { vipIsActive } from "./vip-contract.js";
import { createPublicDisplayAssetUrl } from "./upload-assets.js";

export async function getVipMembership(userId,origin="",client=prisma) {
  const row=await client.vipMembership.findUnique({where:{userId},include:{tier:{include:{assets:{include:{asset:{select:{publicId:true,name:true,mimeType:true,active:true}}}}}}}});
  if(!vipIsActive(row))return null;
  return {tierId:row.tierId,name:row.tier.name,level:row.tier.level,startsAt:row.startsAt.toISOString(),expiresAt:row.expiresAt.toISOString(),privileges:row.tier.privileges,
    assets:row.tier.assets.filter(r=>r.asset.active).map(r=>({privilege:r.privilege,assetId:r.asset.publicId,name:r.asset.name,mimeType:r.asset.mimeType,url:createPublicDisplayAssetUrl(origin,r.asset.publicId)}))};
}

// Expiry is checked on read as well as by maintenance; no permanent entitlement
// or renewed duration is minted by opening the app.
export async function expireVipMemberships(client=prisma) {
  const rows=await client.vipMembership.findMany({where:{user:{vipLevel:{gt:0}},OR:[{expiresAt:{lte:new Date()}},{revokedAt:{not:null}},{tier:{active:false}}]},select:{userId:true},take:500});
  if(!rows.length)return 0;
  for(const row of rows)await synchronizeVip(row.userId);
  return rows.length;
}

export async function synchronizeVip(userId) {
  if (!await prisma.vipMembership.findUnique({where:{userId},select:{userId:true}})) return null;
  return prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    const membership=await tx.vipMembership.findUnique({where:{userId},include:{tier:{include:{assets:true}}}});
    if(!membership)return null; // Never reinterpret a legacy numeric membership.
    const active=vipIsActive(membership),level=active?membership.tier.level:0;
    await tx.user.updateMany({where:{id:userId,vipLevel:{not:level}},data:{vipLevel:level}});
    const ids=active?membership.tier.assets.map(a=>a.assetId):[];
    await tx.uploadAssetAssignment.deleteMany({where:{userId,source:"VIP_TIER",assetId:{notIn:ids}}});
    for(const assetId of new Set(ids)) {
      const existing=await tx.uploadAssetAssignment.findUnique({where:{assetId_userId:{assetId,userId}}});
      if(existing&&existing.source!=="VIP_TIER"&&(!existing.expiresAt||existing.expiresAt>new Date()))continue;
      const data={expiresAt:membership.expiresAt,source:"VIP_TIER",sourceReference:membership.tierId};
      await tx.uploadAssetAssignment.upsert({where:{assetId_userId:{assetId,userId}},create:{assetId,userId,...data},update:data});
    }
    return level;
  });
}
