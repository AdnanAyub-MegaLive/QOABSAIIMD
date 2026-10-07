import { mobileApiError,mobileJson } from "./mobile-api.js";
export function membershipError(e){
 if(e instanceof SyntaxError)return mobileJson({success:false,error:{code:"VALIDATION_ERROR",message:"Invalid JSON."}},422);
 if(e.status)return mobileJson({success:false,error:{code:e.code,message:e.message}},e.status);
 if(["P2034","P2002"].includes(e.code))return mobileJson({success:false,error:{code:"MEMBERSHIP_CONFLICT",message:"Membership changed. Refresh and try again."}},409);
 return mobileApiError(e,"AGENCY_MEMBERSHIP_FAILED");
}
