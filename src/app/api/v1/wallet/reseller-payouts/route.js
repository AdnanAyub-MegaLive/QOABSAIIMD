import { payoutCollection } from "@/lib/reseller-payout-api";
import { mobileOptions } from "@/lib/mobile-api";
export const OPTIONS=mobileOptions;
export const GET=request=>payoutCollection(request);
export const POST=request=>payoutCollection(request);
