import { prisma } from '@/lib/prisma';
import { requireMobileUser, mobileJson, mobileApiError } from '@/lib/mobile-api';
import { withV1Request, v1Options } from '@/lib/mobile-v1';
import { requestAccountDeletion } from '@/lib/account-deletion';
const path='/api/v1/users/me/deletion', methods='POST, OPTIONS';
export const runtime='nodejs';
export function OPTIONS(request) { return v1Options(request, methods); }
export function POST(request) {
 return withV1Request(request,{path,methods,rateLimit:{limit:3,windowMs:60000}},async()=>{
  try {
   const user=await requireMobileUser(request,{syncVip:false,versionGate:false});
   const raw=await request.text(); if(raw.length>1024) return mobileJson({success:false,error:{code:'INVALID_REQUEST',message:'Invalid request.'}},422);
   const input=JSON.parse(raw);
   if(input.confirmation!=='DELETE MY ACCOUNT') return mobileJson({success:false,error:{code:'CONFIRMATION_REQUIRED',message:'Confirm permanent account deletion.'}},422);
   const job=await requestAccountDeletion(prisma,user.id,{source:'AUTHENTICATED_USER'});
   globalThis.portalDisconnectUser?.(user.publicId);
   return mobileJson({success:true,data:{requestId:job.id,status:job.status,message:'Your account is disabled. Deletion will be processed within five business days.'}},202);
  }catch(error){return mobileApiError(error,'ACCOUNT_DELETION_FAILED');}
 });
}
