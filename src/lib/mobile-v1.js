import { randomUUID } from "node:crypto";
import { prisma } from "./prisma";
import { isRateLimited } from "./rate-limit";
import mobileSession from "./mobile-session.cjs";

export const MOBILE_API_VERSION = "v1";

function configuredOrigins() {
  return String(process.env.MOBILE_APP_ORIGIN || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function originFor(request) {
  const requestedOrigin = request.headers.get("origin");
  const origins = configuredOrigins();
  if (!requestedOrigin) return origins[0] || "*";
  return origins.includes(requestedOrigin) ? requestedOrigin : "null";
}

export function clientIp(request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

export function requestId(request) {
  const supplied = request.headers.get("x-request-id")?.trim();
  return /^[A-Za-z0-9._-]{8,128}$/.test(supplied || "")
    ? supplied
    : randomUUID();
}

export function v1Headers(request, requestIdValue, methods = "GET, POST, PATCH, OPTIONS") {
  return {
    "Access-Control-Allow-Origin": originFor(request),
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Idempotency-Key, X-Request-Id",
    "Access-Control-Expose-Headers": "X-Request-Id",
    "Cache-Control": "no-store, max-age=0",
    "Vary": "Origin",
    "X-API-Version": MOBILE_API_VERSION,
    "X-Request-Id": requestIdValue,
  };
}

export function v1Json(request, requestIdValue, body, status = 200, methods) {
  return Response.json(body, {
    status,
    headers: v1Headers(request, requestIdValue, methods),
  });
}

export function v1Options(request, methods) {
  return new Response(null, {
    status: 204,
    headers: v1Headers(request, requestId(request), methods),
  });
}

function callerPublicId(request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    return mobileSession.verifyMobileSessionToken(token).userId;
  } catch {
    return null;
  }
}

async function writeRequestLog({ request, path, requestIdValue, startedAt, response }) {
  try {
    await prisma.apiRequestLog.create({
      data: {
        requestId: requestIdValue,
        apiVersion: MOBILE_API_VERSION,
        method: request.method,
        path,
        statusCode: response.status,
        durationMs: Math.max(0, Date.now() - startedAt),
        clientIp: clientIp(request),
        userPublicId: callerPublicId(request),
      },
    });
  } catch (error) {
    // Request logging must never make a working mobile endpoint unavailable.
    console.error("Mobile API request log failed", { path, requestId: requestIdValue, error });
  }
}

function attachV1Headers(request, requestIdValue, response, methods) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(v1Headers(request, requestIdValue, methods))) {
    headers.set(key, value);
  }
  return new Response(response.body, { status: response.status, headers });
}

export async function withV1Request(request, { path, methods, rateLimit }, handler) {
  const requestIdValue = requestId(request);
  const startedAt = Date.now();
  let response;

  if (
    rateLimit &&
    isRateLimited(`${MOBILE_API_VERSION}:${path}:${clientIp(request)}`, rateLimit)
  ) {
    response = v1Json(
      request,
      requestIdValue,
      {
        success: false,
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests. Try again shortly.",
        },
      },
      429,
      methods,
    );
  } else {
    try {
      response = await handler({ requestId: requestIdValue });
    } catch (error) {
      console.error("Mobile API request failed", { path, requestId: requestIdValue, error });
      response = v1Json(
        request,
        requestIdValue,
        {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Unable to complete this request right now.",
          },
        },
        500,
        methods,
      );
    }
  }

  const versionedResponse = attachV1Headers(request, requestIdValue, response, methods);
  await writeRequestLog({
    request,
    path,
    requestIdValue,
    startedAt,
    response: versionedResponse,
  });
  return versionedResponse;
}
