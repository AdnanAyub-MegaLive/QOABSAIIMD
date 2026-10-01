import { prisma } from "../../../../lib/prisma.js";
import { hashEventPassword, requireEventUser } from "../../../../lib/events/auth.js";
import { eventErrorResponse, eventJson, EventModuleError, validationError } from "../../../../lib/events/errors.js";
import { writeEventLog } from "../../../../lib/events/logger.js";
import { requestIp } from "../../../../lib/events/request.js";
import { eventUserUpdateSchema, parseWith } from "../../../../lib/events/validation.js";

const select = { id: true, name: true, email: true, role: true, active: true, createdAt: true, updatedAt: true };

export async function PUT(request, { params }) {
  try {
    const admin = await requireEventUser(request, { csrf: true, roles: ["SUPER_ADMIN"] });
    const { id } = await params;
    const input = parseWith(eventUserUpdateSchema, await request.json());
    if (id === admin.id && (input.active === false || input.role === "JUNIOR_ADMIN"))
      throw new EventModuleError("SELF_LOCKOUT", "You cannot remove your own Super Admin access.", 409);
    const data = { ...input };
    if (input.password) {
      data.passwordHash = await hashEventPassword(input.password);
      delete data.password;
    }
    if (input.password || input.role || typeof input.active === "boolean")
      data.tokenVersion = { increment: 1 };
    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.eventUser.update({ where: { id }, data, select });
      if (input.password || input.role || typeof input.active === "boolean")
        await tx.eventRefreshToken.deleteMany({ where: { userId: id } });
      return updated;
    });
    await writeEventLog({
      userId: admin.id,
      action: input.password ? "PASSWORD_RESET" : "UPDATE_USER",
      ip: requestIp(request),
      metadata: { targetUserId: id, fields: Object.keys(input) },
    });
    return eventJson({ success: true, data: { user } });
  } catch (error) {
    return eventErrorResponse(validationError(error));
  }
}

export async function DELETE(request, { params }) {
  try {
    const admin = await requireEventUser(request, { csrf: true, roles: ["SUPER_ADMIN"] });
    const { id } = await params;
    if (id === admin.id)
      throw new EventModuleError("SELF_DELETE", "You cannot delete your own account.", 409);
    const target = await prisma.eventUser.findUnique({ where: { id }, select });
    if (!target) throw new EventModuleError("USER_NOT_FOUND", "Events user not found.", 404);
    if (target.role === "SUPER_ADMIN") {
      const count = await prisma.eventUser.count({ where: { role: "SUPER_ADMIN", active: true } });
      if (count <= 1)
        throw new EventModuleError("LAST_SUPER_ADMIN", "The last Super Admin cannot be deleted.", 409);
    }
    await prisma.eventUser.delete({ where: { id } });
    await writeEventLog({
      userId: admin.id,
      action: "DELETE_USER",
      ip: requestIp(request),
      metadata: { targetUserId: id, email: target.email },
    });
    return eventJson({ success: true, data: { deleted: true } });
  } catch (error) {
    return eventErrorResponse(error);
  }
}
