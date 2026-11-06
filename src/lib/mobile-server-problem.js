import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { headers } from "next/headers";

export const mobileRequestContext = new AsyncLocalStorage();
export function mobileRequestId(value) {
  return /^[A-Za-z0-9._-]{8,128}$/.test(value?.trim() || "") ? value.trim() : randomUUID();
}

export function isServerProblem(error, status) {
  return status >= 500 || /CONFIG|INCOMPLETE|STORAGE_UNAVAILABLE|PROVIDER|INTERNAL/i.test(error?.code ?? "")
    || /configuration is incomplete/i.test(error?.message ?? "");
}

export async function currentMobileRequestId() {
  const existing = mobileRequestContext.getStore();
  if (existing) return existing;
  try { return mobileRequestId((await headers()).get("x-request-id")); }
  catch { return randomUUID(); }
}

export function serverProblemBody(error, requestId, status) {
  console.error("Mobile API server problem", { requestId, status, code: error?.code, message: error?.message });
  return { success: false, error: { code: "SERVER_PROBLEM", message: "Server problem. Please try again later." } };
}
