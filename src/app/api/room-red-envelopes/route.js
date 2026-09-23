import { mobileApiError, mobileJson, mobileOptions, requireMobileUser } from "@/lib/mobile-api";
import { createRedEnvelope, listRedEnvelopes, parseRedEnvelopeInput } from "@/lib/red-envelopes";

export function OPTIONS() { return mobileOptions(); }

export async function GET(request) {
  try {
    const user = await requireMobileUser(request);
    const roomId = new URL(request.url).searchParams.get("roomId")?.trim();
    if (!roomId) throw Object.assign(new Error("roomId is required."), { code: "VALIDATION_ERROR" });
    return mobileJson({ success: true, data: { roomId, envelopes: await listRedEnvelopes(roomId, user) } });
  } catch (error) {
    console.error("Red envelope list failed", error);
    return mobileApiError(error, "RED_ENVELOPE_LIST_FAILED");
  }
}

export async function POST(request) {
  try {
    const user = await requireMobileUser(request);
    const data = await createRedEnvelope(user, parseRedEnvelopeInput(await request.json()));
    return mobileJson({ success: true, data }, 201);
  } catch (error) {
    console.error("Red envelope creation failed", error);
    return mobileApiError(error, "RED_ENVELOPE_CREATE_FAILED");
  }
}
