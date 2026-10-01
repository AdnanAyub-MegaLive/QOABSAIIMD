import { prisma } from "../../../lib/prisma.js";
import {
  createEventSession,
  setEventSessionCookies,
  verifyEventPassword,
} from "../../../lib/events/auth.js";
import { eventErrorResponse, eventJson, EventModuleError, validationError } from "../../../lib/events/errors.js";
import { writeEventLog } from "../../../lib/events/logger.js";
import { requestIp } from "../../../lib/events/request.js";
import { loginSchema, parseWith } from "../../../lib/events/validation.js";
import { isRateLimited } from "../../../lib/rate-limit.js";

export async function POST(request) {
  const ip = requestIp(request);
  try {
    if (isRateLimited(`events-login:${ip}`, { limit: 5, windowMs: 15 * 60_000 }))
      throw new EventModuleError("RATE_LIMITED", "Too many login attempts. Try again later.", 429);
    const input = parseWith(loginSchema, await request.json());
    const user = await prisma.eventUser.findUnique({ where: { email: input.email } });
    const valid = user?.active && (await verifyEventPassword(input.password, user.passwordHash));
    if (!valid) {
      await writeEventLog({
        userId: user?.id,
        action: "LOGIN_FAILED",
        ip,
        metadata: { email: input.email },
      });
      throw new EventModuleError("INVALID_CREDENTIALS", "Email or password is incorrect.", 401);
    }
    const session = await createEventSession(user);
    await setEventSessionCookies(session);
    await writeEventLog({ userId: user.id, action: "LOGIN", ip });
    return eventJson({
      success: true,
      data: { user: { id: user.id, name: user.name, email: user.email, role: user.role } },
    });
  } catch (error) {
    return eventErrorResponse(validationError(error), "EVENTS_LOGIN_FAILED");
  }
}
