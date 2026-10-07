import { mobileJson,mobileOptions,requireMobileUser } from "@/lib/mobile-api";
import { membershipError } from "@/lib/agency-membership-api";
export function OPTIONS(){return mobileOptions();}
import { createMembership } from "@/lib/agency-membership";
export async function POST(request,{params}){try{const user=await requireMobileUser(request),{agencyId}=await params;return mobileJson({success:true,data:await createMembership(user.id,{agencyId})},201);}catch(e){return membershipError(e);}}
