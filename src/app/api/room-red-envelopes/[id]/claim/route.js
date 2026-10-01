import { mobileApiError, mobileJson, mobileOptions, requireMobileUser } from "@/lib/mobile-api";
import { claimRedEnvelope } from "@/lib/red-envelopes";

export function OPTIONS() { return mobileOptions(); }

export async function POST(request, { params }) {
  try {
    const user = await requireMobileUser(request);
    const { id } = await params;
    return mobileJson({ success: true, data: await claimRedEnvelope(id, user) });
  } catch (error) {
    console.error("Red envelope claim failed", error);
    return mobileApiError(error, "RED_ENVELOPE_CLAIM_FAILED");
  }
}
