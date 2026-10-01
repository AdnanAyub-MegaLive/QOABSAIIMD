import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "../prisma.js";
import { getEventConfig } from "./config.js";
import { EventModuleError } from "./errors.js";

export const eventCookies = {
  access: "streamline_events_access",
  refresh: "streamline_events_refresh",
  csrf: "streamline_events_csrf",
};

const hashToken = (value) =>
  createHash("sha256").update(String(value)).digest("hex");

export async function hashEventPassword(password) {
  return bcrypt.hash(password, 12);
}

export async function verifyEventPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function signAccessToken(user) {
  const config = getEventConfig();
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion,
      scope: "events-management",
    },
    config.jwtSecret,
    {
      algorithm: "HS256",
      expiresIn: `${config.accessMinutes}m`,
      issuer: "streamline-events",
      audience: "streamline-events-admin",
    },
  );
}

export function verifyEventAccessToken(token) {
  const config = getEventConfig();
  return jwt.verify(token, config.jwtSecret, {
    algorithms: ["HS256"],
    issuer: "streamline-events",
    audience: "streamline-events-admin",
  });
}

export async function createEventSession(user) {
  const config = getEventConfig();
  const refreshToken = randomBytes(48).toString("base64url");
  const expiresAt = new Date(Date.now() + config.refreshDays * 86400000);
  await prisma.eventRefreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt,
    },
  });
  return {
    accessToken: signAccessToken(user),
    refreshToken,
    csrfToken: randomBytes(32).toString("base64url"),
    refreshExpiresAt: expiresAt,
  };
}

export async function rotateEventSession(refreshToken) {
  let record;
  await prisma.$transaction(async (tx) => {
    record = await tx.eventRefreshToken.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
      include: { user: true },
    });
    if (
      !record ||
      record.revokedAt ||
      record.expiresAt <= new Date() ||
      !record.user.active
    )
      throw new EventModuleError(
        "INVALID_REFRESH_TOKEN",
        "The refresh token is invalid or expired.",
        401,
      );
    await tx.eventRefreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });
  });
  return createEventSession(record.user);
}

export async function revokeEventSession(refreshToken) {
  if (!refreshToken) return;
  await prisma.eventRefreshToken.updateMany({
    where: { tokenHash: hashToken(refreshToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function setEventSessionCookies(session) {
  const store = await cookies();
  const secure = process.env.NODE_ENV === "production";
  store.set(eventCookies.access, session.accessToken, {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: "/",
    maxAge: getEventConfig().accessMinutes * 60,
  });
  store.set(eventCookies.refresh, session.refreshToken, {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: "/events-auth",
    expires: session.refreshExpiresAt,
  });
  store.set(eventCookies.csrf, session.csrfToken, {
    httpOnly: false,
    secure,
    sameSite: "strict",
    path: "/",
    expires: session.refreshExpiresAt,
  });
}

export async function clearEventSessionCookies() {
  const store = await cookies();
  for (const name of Object.values(eventCookies))
    store.set(name, "", {
      httpOnly: name !== eventCookies.csrf,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: name === eventCookies.refresh ? "/events-auth" : "/",
      maxAge: 0,
    });
}

export async function requireEventUser(request, options = {}) {
  const store = await cookies();
  const token = store.get(eventCookies.access)?.value;
  if (!token)
    throw new EventModuleError(
      "EVENTS_UNAUTHORIZED",
      "Events authentication is required.",
      401,
    );
  let payload;
  try {
    payload = verifyEventAccessToken(token);
  } catch {
    throw new EventModuleError(
      "EVENTS_UNAUTHORIZED",
      "The Events session is invalid or expired.",
      401,
    );
  }
  const user = await prisma.eventUser.findUnique({ where: { id: payload.sub } });
  if (
    !user ||
    !user.active ||
    user.tokenVersion !== payload.tokenVersion ||
    payload.scope !== "events-management"
  )
    throw new EventModuleError(
      "EVENTS_UNAUTHORIZED",
      "The Events session has been revoked.",
      401,
    );
  if (options.roles && !options.roles.includes(user.role))
    throw new EventModuleError(
      "EVENTS_FORBIDDEN",
      "You do not have permission for this Events action.",
      403,
    );
  if (options.csrf) {
    const cookieToken = store.get(eventCookies.csrf)?.value ?? "";
    const headerToken = request.headers.get("x-events-csrf") ?? "";
    const left = Buffer.from(cookieToken);
    const right = Buffer.from(headerToken);
    if (
      !cookieToken ||
      !headerToken ||
      left.length !== right.length ||
      !timingSafeEqual(left, right)
    )
      throw new EventModuleError(
        "CSRF_INVALID",
        "The CSRF token is missing or invalid.",
        403,
      );
  }
  return user;
}

export function getRefreshCookie(request) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const pair = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${eventCookies.refresh}=`));
  return pair ? decodeURIComponent(pair.slice(pair.indexOf("=") + 1)) : null;
}
