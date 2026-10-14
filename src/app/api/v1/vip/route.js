import { requireMobileUser, mobileJson, mobileApiError } from "@/lib/mobile-api";
import { vipCatalog, changeVip } from "@/lib/vip-commerce";
import { requestOrigin } from "@/lib/user-perks";
import { withV1Request, v1Options } from "@/lib/mobile-v1";
const path="/api/v1/vip",methods="GET, POST, OPTIONS";
export function OPTIONS(request){return v1Options(request,methods);}
export function GET(request){return withV1Request(request,{path,methods,rateLimit:{limit:60,windowMs:60000}},async()=>{try{const user=await requireMobileUser(request);return mobileJson({success:true,data:{tiers:await vipCatalog(user.id,requestOrigin(request))}});}catch(e){return mobileApiError(e,"VIP_READ_FAILED");}});}
export function POST(request){return withV1Request(request,{path,methods,rateLimit:{limit:20,windowMs:60000}},async()=>{try{const user=await requireMobileUser(request),body=await request.json();return mobileJson({success:true,data:await changeVip(user.id,{action:body.action,tierId:body.tierId,requestKey:request.headers.get("Idempotency-Key")})});}catch(e){return e.status?mobileJson({success:false,error:{code:e.code,message:e.message}},e.status):mobileApiError(e,"VIP_UPDATE_FAILED");}});}
