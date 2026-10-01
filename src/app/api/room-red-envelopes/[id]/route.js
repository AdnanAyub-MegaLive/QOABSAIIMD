import { mobileApiError, mobileJson, mobileOptions, requireMobileUser } from "@/lib/mobile-api";
import { getRedEnvelope } from "@/lib/red-envelopes";

export function OPTIONS() { return mobileOptions(); }

export async function GET(request, { params }) {
  try {
    const user = await requireMobileUser(request);
    const { id } = await params;
    return mobileJson({ success: true, data: await getRedEnvelope(id, user) });
  } catch (error) {
    console.error("Red envelope detail failed", error);
    return mobileApiError(error, "RED_ENVELOPE_DETAIL_FAILED");
  }
}
