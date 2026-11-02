import { prisma } from '@/lib/prisma';
import { requireMobileUser, mobileJson, mobileApiError, mobileOptions } from '@/lib/mobile-api';
import { personalPrivileges, updatePersonalPrivilege } from '@/lib/personal-privileges';
import { invalidateChatPerks } from '@/lib/chat-perks-cache';
export const OPTIONS = mobileOptions;
export async function GET(request) {
  try {
    const user=await requireMobileUser(request);
    const row=await prisma.vipMembership.findUnique({where:{userId:user.id},include:{tier:true}});
    const response=await mobileJson({success:true,data:personalPrivileges(row)});
    response.headers.set('Cache-Control','private, no-store');
    return response;
  } catch(error) { return mobileApiError(error,'PRIVILEGES_LOAD_FAILED'); }
}
export async function PATCH(request) {
  try {
    const user=await requireMobileUser(request);
    let body;
    try { body=await request.json(); } catch { return mobileJson({success:false,error:{code:'VALIDATION_ERROR',message:'Provide a valid preference.'}},422); }
    const data=await updatePersonalPrivilege(prisma,user.id,body?.key,body?.enabled);
    invalidateChatPerks(user.id);
    globalThis.portalIo?.to(`user:${user.publicId}`).emit('vip:updated',{success:true,data:{userId:user.publicId}});
    return mobileJson({success:true,data});
  } catch(error) {
    if(error.status)return mobileJson({success:false,error:{code:error.code,message:error.message}},error.status);
    return mobileApiError(error,'PRIVILEGES_SAVE_FAILED');
  }
}
