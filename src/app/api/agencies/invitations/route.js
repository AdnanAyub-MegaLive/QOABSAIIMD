import { prisma } from "@/lib/prisma";
import { mobileJson,mobileOptions,requireMobileUser } from "@/lib/mobile-api";
import { membershipError } from "@/lib/agency-membership-api";
import { createMembership } from "@/lib/agency-membership";
export function OPTIONS(){return mobileOptions();}
export async function GET(request){try{const user=await requireMobileUser(request);const rows=await prisma.agencyJoinRequest.findMany({where:{direction:"OWNER_INVITE",OR:[{userId:user.id},{agency:{ownerUserId:user.id}}]},select:{publicId:true,direction:true,status:true,createdAt:true,user:{select:{publicId:true,name:true,profileImage:true}},agency:{select:{publicId:true,name:true}}},orderBy:{createdAt:"desc"},take:100});return mobileJson({success:true,data:{invitations:rows.map(({publicId,...r})=>({requestId:publicId,...r}))}});}catch(e){return membershipError(e);}}
export async function POST(request){try{const user=await requireMobileUser(request),body=await request.json();if(typeof body.userPublicId!=="string"||!body.userPublicId.trim())return mobileJson({success:false,error:{code:"VALIDATION_ERROR",message:"userPublicId is required."}},422);return mobileJson({success:true,data:await createMembership(user.id,{invite:true,userPublicId:body.userPublicId.trim()})},201);}catch(e){return membershipError(e);}}
