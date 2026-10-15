import { payoutProof } from "@/lib/reseller-payout-api";
export const GET=(request,{params})=>payoutProof(request,params,true);
