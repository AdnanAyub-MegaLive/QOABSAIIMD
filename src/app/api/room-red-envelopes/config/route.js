import { mobileApiError, mobileJson, mobileOptions, requireMobileUser } from "@/lib/mobile-api";
import { redEnvelopePresets } from "@/lib/red-envelopes";

export function OPTIONS() { return mobileOptions(); }

export async function GET(request) {
  try {
    await requireMobileUser(request);
    return mobileJson({ success: true, data: { presets: redEnvelopePresets(), limits: { maxCoins: process.env.RED_ENVELOPE_MAX_COINS || "10000000", maxShareCount: 100, maxDelaySeconds: 300, claimWindowSeconds: Number(process.env.RED_ENVELOPE_CLAIM_WINDOW_SECONDS || 600) } } });
  } catch (error) {
    return mobileApiError(error, "RED_ENVELOPE_CONFIG_FAILED");
  }
}
