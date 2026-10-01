import { requireEventUser } from "../../../lib/events/auth.js";
import { eventErrorResponse, eventJson, validationError } from "../../../lib/events/errors.js";
import { requestIp } from "../../../lib/events/request.js";
import { createEventWithUpload, listEvents } from "../../../lib/events/service.js";
import { eventMetadataSchema, parseWith } from "../../../lib/events/validation.js";

export async function GET(request) {
  try {
    await requireEventUser(request);
    const url = new URL(request.url);
    const status = url.searchParams.get("status") || undefined;
    const records = await listEvents({
      search: url.searchParams.get("q")?.trim() || undefined,
      status: ["DRAFT", "PUBLISHED", "ARCHIVED"].includes(status) ? status : undefined,
      uploaderId: url.searchParams.get("uploader") || undefined,
    });
    return eventJson({ success: true, data: { events: records } });
  } catch (error) {
    return eventErrorResponse(error, "EVENTS_LIST_FAILED");
  }
}

export async function POST(request) {
  try {
    const user = await requireEventUser(request, {
      csrf: true,
      roles: ["SUPER_ADMIN", "JUNIOR_ADMIN"],
    });
    const formData = await request.formData();
    const metadata = parseWith(eventMetadataSchema, {
      name: formData.get("name"),
      slug: formData.get("slug"),
    });
    const event = await createEventWithUpload({
      metadata,
      formData,
      user,
      ip: requestIp(request),
    });
    return eventJson({ success: true, data: { event } }, 201);
  } catch (error) {
    return eventErrorResponse(validationError(error), "EVENT_CREATE_FAILED");
  }
}
