import { mobileJson,mobileOptions,requireMobileUser } from "@/lib/mobile-api";
import { membershipError } from "@/lib/agency-membership-api";
export function OPTIONS(){return mobileOptions();}
import { respondMembership } from "@/lib/agency-membership";
import { emitToUser } from "@/lib/realtime";
export async function POST(request,{params}){try{const user=await requireMobileUser(request),{requestId}=await params,body=await request.json();const data=await respondMembership(user.id,requestId,body.accept);if(data.status==="APPROVED")emitToUser(data.previousUserId,"host:approved",data);return mobileJson({success:true,data});}catch(e){return membershipError(e);}}
