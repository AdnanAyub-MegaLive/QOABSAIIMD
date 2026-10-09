import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/portal-admin";
import { VIP_PRIVILEGES,validateVipTier } from "@/lib/vip-contract";
const fail=(message,status=422)=>Object.assign(new Error(message),{status,code:"VALIDATION_ERROR"});
function response(error){return Response.json({success:false,error:{code:error.code==="P2002"?"VIP_LEVEL_EXISTS":error.status?error.code:"VIP_UPDATE_FAILED",message:error.code==="P2002"?"This VIP level already exists.":error.status?error.message:"Unable to update VIP management."}},{status:error.code==="P2002"?409:error.status??500});}
export async function GET(request){try{
  await requirePermission("vip.view");
  const page=Math.max(1,Math.min(100000,Number(new URL(request.url).searchParams.get("page"))||1));
  const [tiers,total,assets,members]=await Promise.all([
    prisma.vipTier.findMany({include:{assets:true,_count:{select:{members:true}}},orderBy:{level:"asc"},skip:(page-1)*50,take:50}),prisma.vipTier.count(),
    prisma.uploadAsset.findMany({where:{active:true,category:{in:VIP_PRIVILEGES.map(p=>p.category).filter(Boolean)}},select:{id:true,publicId:true,name:true,category:true},take:1000,orderBy:{createdAt:"desc"}}),
    prisma.vipMembership.findMany({include:{user:{select:{publicId:true,name:true}},tier:{select:{name:true,level:true}}},orderBy:{startsAt:"desc"},take:100})]);
  return Response.json({success:true,data:{tiers,total,page,assets,members,privileges:VIP_PRIVILEGES}});
}catch(error){return response(error)}}
export async function POST(request){try{
  const admin=await requirePermission("vip.manage"),body=await request.json();
  const data=await prisma.$transaction(async tx=>{
    let row;
    if(body.action==="SAVE"){
      const input=validateVipTier(body),{assets,...fields}=input;
      if(body.id){const existing=await tx.vipTier.findUnique({where:{id:String(body.id)}});if(!existing)throw fail("VIP not found.",404);if(existing.level!==fields.level)throw fail("Level number cannot change after creation.");}
      const artwork=await tx.uploadAsset.findMany({where:{id:{in:assets.map(a=>a.assetId)},active:true},select:{id:true,category:true}});
      for(const item of assets)if(!artwork.some(a=>a.id===item.assetId&&a.category===VIP_PRIVILEGES.find(p=>p.key===item.privilege)?.category))throw fail("An asset is inactive or has the wrong category.");
      row=body.id?await tx.vipTier.update({where:{id:String(body.id)},data:fields}):await tx.vipTier.create({data:fields});
      await tx.vipBenefitAsset.deleteMany({where:{tierId:row.id}});
      await tx.vipBenefitAsset.createMany({data:assets.map(a=>({...a,tierId:row.id})),skipDuplicates:true});
    }else if(body.action==="GRANT"||body.action==="REVOKE"){
      const user=await tx.user.findFirst({where:{publicId:String(body.userPublicId??""),deletedAt:null,status:"ACTIVE"}});
      if(!user)throw fail("Active user not found.",404);
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
      if(body.action==="REVOKE"){
        await tx.vipMembership.updateMany({where:{userId:user.id},data:{revokedAt:new Date()}});
        await tx.user.update({where:{id:user.id},data:{vipLevel:0}});
        await tx.uploadAssetAssignment.deleteMany({where:{userId:user.id,source:"VIP_TIER"}});
        row={id:user.publicId};
      }else{
        const tier=await tx.vipTier.findFirst({where:{id:String(body.tierId??""),active:true},include:{assets:true}});
        if(!tier)throw fail("Select an active VIP tier.");
        const startsAt=new Date(),expiresAt=new Date(startsAt.getTime()+tier.validDays*86400000);
        await tx.vipMembership.upsert({where:{userId:user.id},create:{userId:user.id,tierId:tier.id,startsAt,expiresAt},update:{tierId:tier.id,startsAt,expiresAt,revokedAt:null}});
        await tx.user.update({where:{id:user.id},data:{vipLevel:tier.level}});
        await tx.uploadAssetAssignment.deleteMany({where:{userId:user.id,source:"VIP_TIER"}});
        for(const item of tier.assets){
          // Never overwrite a separately purchased/admin-granted entitlement.
          await tx.uploadAssetAssignment.upsert({where:{assetId_userId:{assetId:item.assetId,userId:user.id}},update:{},create:{assetId:item.assetId,userId:user.id,expiresAt,source:"VIP_TIER",sourceReference:tier.id}});
        }
        row={id:user.publicId,expiresAt};
      }
    }else throw fail("Unsupported action.");
    await tx.auditLog.create({data:{adminId:admin.id,action:`VIP_${body.action}`,category:"USER_MANAGEMENT",entityType:"VIP",entityId:row.id,description:`${admin.name} performed VIP ${body.action.toLowerCase()}.`}});
    return {id:row.id,expiresAt:row.expiresAt??null};
  });return Response.json({success:true,data});
}catch(error){return response(error)}}
