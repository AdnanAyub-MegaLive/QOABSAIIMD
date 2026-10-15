import { payoutDetail } from "@/lib/reseller-payout-api";
export const GET=(request,{params})=>payoutDetail(request,params,true);
export const PATCH=(request,{params})=>payoutDetail(request,params,true);
