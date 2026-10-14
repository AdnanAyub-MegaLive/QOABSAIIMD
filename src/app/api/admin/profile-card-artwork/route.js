import {prisma} from "@/lib/prisma";
import {requirePermission} from "@/lib/portal-admin";
import {sameOrigin,jsonBody} from "@/lib/game-control/http";
import {validateCardRanges} from "@/lib/profile-card-artwork";
const fail=e=>Response.json({success:false,error:{message:e.status?e.message:"Unable to save artwork."}},{status:e.status??500});
export async function GET(){try{await requirePermission("rules.view");return Response.json({success:true,data:await prisma.profileCardArtwork.findUnique({where:{id:"GLOBAL"}})??{revision:0,ranges:[]}});}catch(e){return fail(e);}}
export async function PUT(request){try{const admin=await requirePermission("rules.levels");sameOrigin(request);const body=await jsonBody(request),ranges=validateCardRanges(body.ranges);if(!Number.isSafeInteger(body.revision)||body.revision<0)throw Object.assign(new Error("Invalid revision."),{status:422});const data=await prisma.$transaction(async tx=>{
 for(const r of ranges)for(const key of ["backgroundAssetId","badgeAssetId"])if(r[key]){const asset=await tx.uploadAsset.findFirst({where:{publicId:r[key],active:true,isGlobal:true,mimeType:{in:key==="badgeAssetId"?["image/png","image/jpeg","image/webp","image/gif"]:["image/png","image/jpeg","image/webp","image/gif","video/mp4"]}}});if(!asset)throw Object.assign(new Error("Select active global artwork; badges must be images."),{status:422});}
 await tx.profileCardArtwork.upsert({where:{id:"GLOBAL"},create:{id:"GLOBAL"},update:{}});
 const result=await tx.profileCardArtwork.updateMany({where:{id:"GLOBAL",revision:body.revision},data:{ranges,revision:{increment:1}}});if(!result.count)throw Object.assign(new Error("Artwork settings changed. Reload first."),{status:409});
 await tx.auditLog.create({data:{adminId:admin.id,action:"PROFILE_CARD_ARTWORK_UPDATED",category:"CONTENT_MANAGEMENT",entityType:"ProfileCardArtwork",entityId:"GLOBAL",description:"Updated level-range artwork.",metadata:{ranges}}});return tx.profileCardArtwork.findUnique({where:{id:"GLOBAL"}});
 });return Response.json({success:true,data});}catch(e){return fail(e);}}
