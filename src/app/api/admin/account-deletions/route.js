import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/portal-admin';
import { sameOrigin } from '@/lib/game-control/http';
import { requestAccountDeletion, runAccountDeletion, completeAccountDeletion } from '@/lib/account-deletion';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const errorResponse=e=>Response.json({success:false,error:{message:e.status?e.message:'Deletion cleanup needs review.',code:e.code||'CLEANUP_FAILED'}},{status:e.status||500});
export async function GET(){try{await requirePermission('users.delete');const rows=await prisma.accountDeletionRequest.findMany({orderBy:{createdAt:'desc'},take:100});return Response.json({success:true,data:rows},{headers:{'Cache-Control':'no-store'}});}catch(e){return errorResponse(e);}}
export async function POST(request){try{
 const admin=await requirePermission('users.delete'); sameOrigin(request);
 const raw=await request.text(); if(raw.length>2048)throw Object.assign(Error('Request too large.'),{status:413});
 const input=JSON.parse(raw);
 if(input.action==='REQUEST'){
  if(input.ownershipVerified!==true||input.confirmation!==input.publicId)throw Object.assign(Error('Verify ownership and enter the exact public ID.'),{status:422});
  const user=await prisma.user.findUnique({where:{publicId:String(input.publicId)}});
  if(!user)throw Object.assign(Error('User not found.'),{status:404});
  const job=await requestAccountDeletion(prisma,user.id,{source:'VERIFIED_SUPPORT',verifiedBy:admin.id});
  globalThis.portalDisconnectUser?.(user.publicId);
  return Response.json({success:true,data:job});
 }
 if(input.action==='COMPLETE'){
  await completeAccountDeletion(prisma,String(input.requestId),{verifiedBy:admin.id,externalCopiesReviewed:input.externalCopiesReviewed,backupPolicyVerified:input.backupPolicyVerified});return Response.json({success:true});
 }
 if(input.action==='PROCESS'){
  const job=await prisma.accountDeletionRequest.findUnique({where:{id:String(input.requestId)}});
  if(!job)throw Object.assign(Error('Request not found.'),{status:404});
  if(job.attempts>=10)await prisma.accountDeletionRequest.update({where:{id:job.id},data:{attempts:0}});
  await runAccountDeletion(prisma,job.id);return Response.json({success:true});
 }
 throw Object.assign(Error('Unsupported action.'),{status:422});
}catch(e){return errorResponse(e);}}
