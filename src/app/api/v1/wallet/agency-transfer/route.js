import { transferToAgencyOwner } from '@/lib/agency-wallet-transfer';
import { mobileApiError, mobileJson, requireMobileUser } from '@/lib/mobile-api';
import { v1Options, withV1Request } from '@/lib/mobile-v1';
const path='/api/v1/wallet/agency-transfer', methods='POST, OPTIONS';
export function OPTIONS(request){return v1Options(request,methods);}
export function POST(request){return withV1Request(request,{path,methods,rateLimit:{limit:10,windowMs:60000}},async()=>{
  try{const user=await requireMobileUser(request);const body=await request.json();return mobileJson({success:true,data:await transferToAgencyOwner(user.id,body,request.headers.get('Idempotency-Key'))});}
  catch(error){
    if(error instanceof SyntaxError)return mobileJson({success:false,error:{code:'INVALID_JSON',message:'Invalid JSON body.'}},400);
    if(['QUOTE_CHANGED','RECIPIENT_UNAVAILABLE'].includes(error.code))return mobileJson({success:false,error:{code:error.code,message:error.message}},409);
    return mobileApiError(error,'AGENCY_TRANSFER_FAILED');
  }
});}
