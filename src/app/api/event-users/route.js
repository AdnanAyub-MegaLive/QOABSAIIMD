import { prisma } from "../../../lib/prisma.js";
import { hashEventPassword, requireEventUser } from "../../../lib/events/auth.js";
import { eventErrorResponse, eventJson, EventModuleError, validationError } from "../../../lib/events/errors.js";
import { writeEventLog } from "../../../lib/events/logger.js";
import { requestIp } from "../../../lib/events/request.js";
import { eventUserSchema, parseWith } from "../../../lib/events/validation.js";

const publicSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  createdAt: true,
  updatedAt: true,
};

export async function GET(request) {
  try {
    await requireEventUser(request, { roles: ["SUPER_ADMIN"] });
    const users = await prisma.eventUser.findMany({
      select: publicSelect,
      orderBy: { createdAt: "desc" },
    });
    return eventJson({ success: true, data: { users } });
  } catch (error) {
    return eventErrorResponse(error);
  }
}

export async function POST(request) {
  try {
    const admin = await requireEventUser(request, {
      csrf: true,
      roles: ["SUPER_ADMIN"],
    });
    const input = parseWith(eventUserSchema, await request.json());
    const { password, ...profile } = input;
    const user = await prisma.eventUser.create({
      data: {
        ...profile,
        role: "JUNIOR_ADMIN",
        passwordHash: await hashEventPassword(password),
      },
      select: publicSelect,
    });
    await writeEventLog({
      userId: admin.id,
      action: "CREATE_USER",
      ip: requestIp(request),
      metadata: { targetUserId: user.id, email: user.email, role: user.role },
    });
    return eventJson({ success: true, data: { user } }, 201);
  } catch (error) {
    if (error?.code === "P2002")
      return eventErrorResponse(
        new EventModuleError(
          "EMAIL_EXISTS",
          "An Events user already uses this email.",
          409,
        ),
      );
    return eventErrorResponse(validationError(error));
  }
}
