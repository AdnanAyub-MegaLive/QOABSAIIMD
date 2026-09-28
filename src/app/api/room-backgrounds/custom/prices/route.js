import { getCustomBackgroundConfiguration } from "@/lib/custom-room-backgrounds";
import { mobileApiError, mobileJson, mobileOptions, requireMobileUser } from "@/lib/mobile-api";

export function OPTIONS() { return mobileOptions(); }
export async function GET(request) {
  try {
    await requireMobileUser(request);
    const config = await getCustomBackgroundConfiguration();
    return mobileJson({ success: true, data: { prices: config.prices, limits: { maxBytes: config.settings.maxBytes, mimeTypes: config.settings.mimeTypes }, enabled: config.settings.enabled } });
  } catch (error) { return mobileApiError(error, "CUSTOM_BACKGROUND_PRICES_FAILED"); }
}
