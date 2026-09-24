import { mobileApiError, mobileJson, mobileOptions, requireMobileUser } from "@/lib/mobile-api";
import { getRedEnvelopeConfiguration } from "@/lib/red-envelopes";

export function OPTIONS() { return mobileOptions(); }

export async function GET(request) {
  try {
    await requireMobileUser(request);
    const configuration = await getRedEnvelopeConfiguration();
    return mobileJson({ success: true, data: { enabled: configuration.settings.enabled, presets: configuration.presets, limits: { maxCoins: configuration.settings.maxCoins, maxShareCount: configuration.settings.maxShareCount, maxDelaySeconds: configuration.settings.maxDelaySeconds, claimWindowSeconds: configuration.settings.claimWindowSeconds }, updatedAt: configuration.settings.updatedAt } });
  } catch (error) {
    return mobileApiError(error, "RED_ENVELOPE_CONFIG_FAILED");
  }
}
