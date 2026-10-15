import { payoutCollection } from "@/lib/reseller-payout-api";
export const GET=request=>payoutCollection(request,true);
