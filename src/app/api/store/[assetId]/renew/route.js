import { prisma } from '@/lib/prisma';
import { requireMobileUser,mobileJson,mobileApiError,mobileOptions } from '@/lib/mobile-api';
import { isRateLimited } from '@/lib/rate-limit';
import { renewProp } from '@/lib/prop-renewal';
export function OPTIONS(){return mobileOptions();}
export async function POST(request,{params}){
 try{
  const user=await requireMobileUser(request);
  if(isRateLimited(`prop-renew:${user.id}`,{limit:20,windowMs:60000}))return mobileJson({success:false,error:{code:'RATE_LIMITED',message:'Try again in a minute.'}},429);
  const {assetId}=await params;
  return mobileJson({success:true,data:await renewProp(prisma,user.id,assetId,request.headers.get('Idempotency-Key'))});
 }catch(error){if(error.status)return mobileJson({success:false,error:{code:error.code,message:error.message}},error.status);console.error('Store renewal failed',error);return mobileApiError(error,'STORE_RENEWAL_FAILED');}
}
