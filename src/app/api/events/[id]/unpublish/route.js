import { requireEventUser } from "../../../../../lib/events/auth.js";
import { eventErrorResponse, eventJson } from "../../../../../lib/events/errors.js";
import { requestIp } from "../../../../../lib/events/request.js";
import { changeEventStatus } from "../../../../../lib/events/service.js";

export async function POST(request, { params }) {
  try {
    const user = await requireEventUser(request, { csrf: true });
    const { id } = await params;
    const event = await changeEventStatus({ id, status: "DRAFT", user, ip: requestIp(request) });
    return eventJson({ success: true, data: { event } });
  } catch (error) {
    return eventErrorResponse(error, "EVENT_UNPUBLISH_FAILED");
  }
}
