import { requireMobileUser,mobileJson,mobileApiError } from "@/lib/mobile-api";
import { getVipMembership } from "@/lib/vip-membership";
import { requestOrigin } from "@/lib/user-perks";
import { withV1Request,v1Options } from "@/lib/mobile-v1";
const path="/api/v1/users/me/vip",methods="GET, OPTIONS";
export function OPTIONS(request){return v1Options(request,methods)}
export function GET(request){return withV1Request(request,{path,methods,rateLimit:{limit:60,windowMs:60000}},async()=>{try{
  const user=await requireMobileUser(request);return mobileJson({success:true,data:{vip:await getVipMembership(user.id,requestOrigin(request))}});
}catch(e){return mobileApiError(e,"VIP_READ_FAILED")}})}
