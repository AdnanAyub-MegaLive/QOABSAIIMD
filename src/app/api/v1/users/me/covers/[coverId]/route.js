import {prisma} from "@/lib/prisma";
import {requireMobileUser,mobileJson,mobileApiError} from "@/lib/mobile-api";
import {profileCoverDto} from "@/lib/profile-cover";
import {requestOrigin} from "@/lib/user-perks";
export async function DELETE(request,{params}){try{
 const user=await requireMobileUser(request),{coverId}=await params;
 await prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
  if(coverId==="legacy")await tx.profileCover.deleteMany({where:{userId:user.id}});
  else await tx.profileCoverItem.deleteMany({where:{id:coverId,userId:user.id}});
  await tx.auditLog.create({data:{action:"PROFILE_COVER_DELETED",category:"USER_MANAGEMENT",entityType:"User",entityId:user.publicId,description:"Removed own carousel cover."}});
 });return mobileJson({success:true,data:await profileCoverDto(prisma,user.id,user.id,requestOrigin(request))});
}catch(e){return mobileApiError(e,"PROFILE_COVER_FAILED");}}
