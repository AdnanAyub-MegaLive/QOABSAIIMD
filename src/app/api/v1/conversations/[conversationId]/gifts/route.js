import { POST as sendGift } from "@/app/api/gifts/send/route";
import { mobileApiError, mobileOptions } from "@/lib/mobile-api";
export function OPTIONS() { return mobileOptions(); }
export async function POST(request, { params }) {
  try {
    const { conversationId } = await params;
    const body = await request.json();
    return sendGift(new Request(request.url, { method: "POST", headers: request.headers, body: JSON.stringify({ ...body, conversationId }) }));
  } catch (error) { return mobileApiError(error, "CHAT_GIFT_FAILED"); }
}
