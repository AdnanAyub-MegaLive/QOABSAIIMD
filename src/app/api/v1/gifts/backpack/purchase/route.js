import { prisma } from '@/lib/prisma';
import { mobileApiError,mobileJson,mobileOptions,requireMobileUser } from '@/lib/mobile-api';
import { purchaseBackpack } from '@/lib/backpack-purchase';
export function OPTIONS(){return mobileOptions();}
export async function GET(request){
  try{await requireMobileUser(request);return mobileJson({success:true,data:{idempotencyVersion:1}},200);}
  catch(error){return mobileApiError(error,'BACKPACK_PURCHASE_FAILED');}
}
export async function POST(request){
  try {
    const user=await requireMobileUser(request),body=await request.json();
    const data=await purchaseBackpack(prisma,user,{giftId:body?.giftId,quantity:body?.quantity ?? 1,requestKey:request.headers.get('Idempotency-Key')});
    return mobileJson({success:true,data},201);
  }catch(error){
    if(error.status)return mobileJson({success:false,error:{code:error.code,message:error.message}},error.status);
    return mobileApiError(error,'BACKPACK_PURCHASE_FAILED');
  }
}
