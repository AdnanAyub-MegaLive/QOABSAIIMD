import { isServerProblem, mobileRequestContext, mobileRequestId, serverProblemBody } from "./mobile-server-problem.js";
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
  return mobileRequestId(request.headers.get("x-request-id"));
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
  const payload = isServerProblem(body?.error, status) ? serverProblemBody(body?.error, requestIdValue, status) : body;
  return Response.json(payload, {
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

async function sanitizeDelegatedError(response, requestIdValue) {
  if (response.status < 400) return response;
  let body;
  if (response.headers.get("Content-Type")?.includes("json")) {
    try { body = await response.clone().json(); } catch { /* A 5xx still needs a safe response. */ }
  }
  const detail = {
    code: body?.error?.code ?? body?.code ?? "HTTP_" + response.status,
    message: body?.error?.message ?? (typeof body?.error === "string" ? body.error : body?.message),
  };
  if (!isServerProblem(detail, response.status)) return response;
  if (detail.code === "SERVER_PROBLEM" && detail.message === "Server problem. Please try again later.") return response;
  const safe = serverProblemBody(detail, requestIdValue, response.status);
  const headers = new Headers(response.headers);
  headers.delete("Content-Length");
  headers.set("Content-Type", "application/json");
  return Response.json(safe, { status: response.status, headers });
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
      response = await mobileRequestContext.run(requestIdValue, () => handler({ requestId: requestIdValue }));
    } catch (error) {

      response = v1Json(
        request,
        requestIdValue,
        {
          success: false,
          error: {
            code: error?.code ?? "INTERNAL_ERROR",
            message: error?.message ?? String(error),
          },
        },
        500,
        methods,
      );
    }
  }

  const versionedResponse = attachV1Headers(request, requestIdValue, await sanitizeDelegatedError(response, requestIdValue), methods);
  await writeRequestLog({
    request,
    path,
    requestIdValue,
    startedAt,
    response: versionedResponse,
  });
  return versionedResponse;
}
