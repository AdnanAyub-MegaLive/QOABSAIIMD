import { payoutDetail } from "@/lib/reseller-payout-api";
import { mobileOptions } from "@/lib/mobile-api";
export const OPTIONS=mobileOptions;
export const GET=(request,{params})=>payoutDetail(request,params);
export const PATCH=(request,{params})=>payoutDetail(request,params);
