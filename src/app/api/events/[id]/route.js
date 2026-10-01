import { prisma } from "../../../../lib/prisma.js";
import { requireEventUser } from "../../../../lib/events/auth.js";
import { eventErrorResponse, eventJson, validationError } from "../../../../lib/events/errors.js";
import { writeEventLog } from "../../../../lib/events/logger.js";
import { requestIp } from "../../../../lib/events/request.js";
import { deleteEvent, getEvent, serializeEvent } from "../../../../lib/events/service.js";
import { eventUpdateSchema, parseWith } from "../../../../lib/events/validation.js";

export async function GET(request, { params }) {
  try {
    await requireEventUser(request);
    const { id } = await params;
    return eventJson({ success: true, data: { event: serializeEvent(await getEvent(id)) } });
  } catch (error) {
    return eventErrorResponse(error, "EVENT_GET_FAILED");
  }
}

export async function PUT(request, { params }) {
  try {
    const user = await requireEventUser(request, { csrf: true, roles: ["SUPER_ADMIN"] });
    const { id } = await params;
    const event = await getEvent(id);
    const input = parseWith(eventUpdateSchema, await request.json());
    const updated = await prisma.event.update({
      where: { id: event.id },
      data: input,
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        versions: { orderBy: { version: "desc" } },
      },
    });
    await writeEventLog({
      userId: user.id,
      eventId: event.id,
      action: "UPDATE",
      ip: requestIp(request),
      metadata: input,
    });
    return eventJson({ success: true, data: { event: serializeEvent(updated) } });
  } catch (error) {
    return eventErrorResponse(validationError(error), "EVENT_UPDATE_FAILED");
  }
}

export async function DELETE(request, { params }) {
  try {
    const user = await requireEventUser(request, { csrf: true, roles: ["SUPER_ADMIN"] });
    const { id } = await params;
    await deleteEvent({ id, user, ip: requestIp(request) });
    return eventJson({ success: true, data: { deleted: true } });
  } catch (error) {
    return eventErrorResponse(error, "EVENT_DELETE_FAILED");
  }
}
