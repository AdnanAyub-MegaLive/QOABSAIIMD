import { prisma } from '@/lib/prisma';
import { requireMobileUser, mobileJson, mobileApiError } from '@/lib/mobile-api';
import { v1Options, withV1Request } from '@/lib/mobile-v1';
import { resolveGiftRequests } from '@/lib/gift-resolution';
const methods='POST, OPTIONS';
export function OPTIONS(request){return v1Options(request,methods);}
export async function POST(request){const response=await withV1Request(request,{path:'/api/v1/gifts/resolve',methods,rateLimit:{limit:30,windowMs:60000}},async()=>{
  try {
    const user=await requireMobileUser(request);
    let body;try{body=await request.json();}catch{throw Object.assign(new Error('Provide a JSON object with requestIds.'),{code:'VALIDATION_ERROR'});}
    const response=await mobileJson({success:true,data:await resolveGiftRequests(prisma,user.id,body)});
    response.headers.set('Cache-Control','private, no-store');return response;
  }catch(error){return mobileApiError(error,'GIFT_RESOLUTION_FAILED');}
});response.headers.set('Cache-Control','private, no-store');return response;}
