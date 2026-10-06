import { requireMobileUser,mobileJson,mobileApiError } from "@/lib/mobile-api";
import { withV1Request,v1Options } from "@/lib/mobile-v1";
import sessions from "@/lib/mobile-session.cjs";
import { issueManagementHandoff } from "@/lib/management-web";
export function OPTIONS(r){return v1Options(r,"POST, OPTIONS");}
export function POST(request){return withV1Request(request,{path:"/api/v1/management/portal-session",methods:"POST, OPTIONS",rateLimit:{limit:10,windowMs:60000}},async()=>{try{const user=await requireMobileUser(request);const payload=sessions.verifyMobileSessionToken(request.headers.get("authorization")?.replace(/^Bearer\s+/i,""));return mobileJson({success:true,data:await issueManagementHandoff(user,payload)});}catch(e){if(e.status)return mobileJson({success:false,error:{code:e.code,message:e.message}},e.status);return mobileApiError(e);}});}
