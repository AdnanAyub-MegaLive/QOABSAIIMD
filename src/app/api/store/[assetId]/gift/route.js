import {prisma} from '@/lib/prisma';
import {giftStoreProp} from '@/lib/store-prop-gifts';
import {mobileOptions,mobileJson,mobileApiError,requireMobileUser} from '@/lib/mobile-api';
export const OPTIONS=mobileOptions;
export async function POST(request,{params}){
 try{
  const user=await requireMobileUser(request),{assetId}=await params;
  return mobileJson({success:true,data:await giftStoreProp(prisma,user,assetId,await request.json())});
 }catch(error){
  if(error instanceof SyntaxError)return mobileJson({success:false,error:{code:'VALIDATION_ERROR',message:'Provide valid JSON.'}},422);
  if(error.status)return mobileJson({success:false,error:{code:error.code,message:error.message}},error.status);
  return mobileApiError(error,'STORE_GIFT_FAILED');
 }
}
