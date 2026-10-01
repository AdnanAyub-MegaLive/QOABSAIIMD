import { getProfitSplitRule, percentFromBps } from "@/lib/profit-rules";
import {
  mobileApiError,
  mobileJson,
  mobileOptions,
  requireMobileUser,
} from "@/lib/mobile-api";

export function OPTIONS() {
  return mobileOptions();
}

export async function GET(request) {
  try {
    await requireMobileUser(request);
    const rule = await getProfitSplitRule();
    return mobileJson({
      success: true,
      data: {
        profitSplit: {
          hostPercent: percentFromBps(rule.hostShareBps),
          agencyPercent: percentFromBps(rule.agencyShareBps),
          companyPercent: percentFromBps(rule.companyShareBps),
          normalUserReusablePercent: percentFromBps(
            rule.normalUserReusableShareBps,
          ),
          normalUserCompanyPercent:
            100 - percentFromBps(rule.normalUserReusableShareBps),
          normalUserWithdrawable: false,
          hostRequiresAgency: true,
          version: rule.version,
          updatedAt: rule.updatedAt.toISOString(),
        },
      },
    });
  } catch (error) {
    return mobileApiError(error, "PLATFORM_RULES_FAILED");
  }
}
