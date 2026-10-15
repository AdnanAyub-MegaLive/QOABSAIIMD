import { payoutProof } from "@/lib/reseller-payout-api";
import { mobileOptions } from "@/lib/mobile-api";
export const OPTIONS=mobileOptions;
export const GET=(request,{params})=>payoutProof(request,params);
export const POST=(request,{params})=>payoutProof(request,params);
