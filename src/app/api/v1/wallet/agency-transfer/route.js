import { transferToAgencyOwner } from '@/lib/agency-wallet-transfer';
import { mobileApiError, mobileJson, requireMobileUser } from '@/lib/mobile-api';
import { v1Options, withV1Request } from '@/lib/mobile-v1';
const path='/api/v1/wallet/agency-transfer', methods='POST, OPTIONS';
export function OPTIONS(request){return v1Options(request,methods);}
export function POST(request){return withV1Request(request,{path,methods,rateLimit:{limit:10,windowMs:60000}},async()=>{
  try{const user=await requireMobileUser(request);const body=await request.json();return mobileJson({success:true,data:await transferToAgencyOwner(user.id,body,request.headers.get('Idempotency-Key'))});}
  catch(error){return mobileApiError(error,'AGENCY_TRANSFER_FAILED');}
});}
