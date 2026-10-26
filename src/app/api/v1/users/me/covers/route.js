import {prisma} from "@/lib/prisma";
import {requireMobileUser,mobileJson,mobileApiError} from "@/lib/mobile-api";
import {readAvatarFile} from "@/lib/avatar-upload";
import {decodeProfileCover,profileCoverDto,COVER_GIF_MAX_BYTES} from "@/lib/profile-cover";
import {requestOrigin} from "@/lib/user-perks";
import {isRateLimited} from "@/lib/rate-limit";
export async function POST(request){try{
 const user=await requireMobileUser(request);
 if(isRateLimited(`profile-cover:${user.id}`,{limit:10,windowMs:3600000}))return mobileJson({success:false,error:{code:"RATE_LIMITED",message:"Try again later."}},429);
 const file=await readAvatarFile(request,COVER_GIF_MAX_BYTES,["image","video"]),bytes=await decodeProfileCover(file);
 await prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
  const count=await tx.profileCoverItem.count({where:{userId:user.id}})+(await tx.profileCover.count({where:{userId:user.id}}));
  if(count>=5)throw Object.assign(new Error("You may upload up to five covers."),{code:"COVER_LIMIT_REACHED",status:409});
  await tx.profileCoverItem.create({data:{userId:user.id,imageData:bytes,mimeType:["image/gif","video/mp4"].includes(file.type)?file.type:"image/webp"}});
  await tx.auditLog.create({data:{action:"PROFILE_COVER_UPLOADED",category:"USER_MANAGEMENT",entityType:"User",entityId:user.publicId,description:"Added profile carousel cover."}});
 });
 return mobileJson({success:true,data:await profileCoverDto(prisma,user.id,user.id,requestOrigin(request))},201);
}catch(e){if(e.code==="VIDEO_VALIDATION_UNAVAILABLE")return mobileJson({success:false,error:{code:e.code,message:e.message}},503);if(e.code==="COVER_LIMIT_REACHED")return mobileJson({success:false,error:{code:e.code,message:e.message}},409);if(e.code==="FILE_TOO_LARGE")return mobileJson({success:false,error:{code:e.code,message:e.message}},413);return mobileApiError(e,"PROFILE_COVER_FAILED");}}
