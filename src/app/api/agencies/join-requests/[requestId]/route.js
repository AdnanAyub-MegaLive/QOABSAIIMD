import { portalPermissionError } from "@/lib/portal-admin";
export async function PATCH() {
  const denied = await portalPermissionError("agencies.manage");
  if (denied) return denied;
  return Response.json({success:false,error:{code:"MEMBERSHIP_CONSENT_REQUIRED",message:"Membership decisions must be made in the app by the agency owner for user requests, or by the invited user for agency invitations."}},{status:403});
}
