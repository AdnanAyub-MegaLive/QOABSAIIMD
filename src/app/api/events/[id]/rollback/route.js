import { z } from "zod";
import { requireEventUser } from "../../../../../lib/events/auth.js";
import { eventErrorResponse, eventJson, validationError } from "../../../../../lib/events/errors.js";
import { requestIp } from "../../../../../lib/events/request.js";
import { rollbackEvent } from "../../../../../lib/events/service.js";
import { parseWith } from "../../../../../lib/events/validation.js";

export async function POST(request, { params }) {
  try {
    const user = await requireEventUser(request, { csrf: true, roles: ["SUPER_ADMIN"] });
    const input = parseWith(z.object({ version: z.coerce.number().int().positive() }), await request.json());
    const { id } = await params;
    const event = await rollbackEvent({ id, version: input.version, user, ip: requestIp(request) });
    return eventJson({ success: true, data: { event } });
  } catch (error) {
    return eventErrorResponse(validationError(error), "EVENT_ROLLBACK_FAILED");
  }
}
