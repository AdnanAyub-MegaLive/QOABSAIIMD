"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { clearRecordCache } from "./record-cache";

const REFRESH_INTERVAL_MS = 10000;

// Pages stay in the browser cache for a short time (next.config staleTimes).
// Remember when staff last changed something so a cached page they return to
// is refreshed straight away instead of showing data from before the change.
let lastMutationAt = 0;
export function markPortalMutation() { lastMutationAt = Date.now(); }
if (typeof window !== "undefined" && !window.__portalFetchWatch) {
  window.__portalFetchWatch = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const response = await original(input, init);
    try {
      const method = String(init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
      const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url, window.location.href);
      if (method !== "GET" && method !== "HEAD" && url.origin === window.location.origin && response.ok) markPortalMutation();
    } catch {}
    return response;
  };
}

export default function PortalAutoRefresh() {
  const router = useRouter();
  const pathname = usePathname();
  const lastRefresh = useRef(0);
  const seenAt = useRef(new Map());

  useEffect(() => {
    // The sign-in page means the session ended: drop cached records.
    if (pathname === "/") { clearRecordCache(); seenAt.current.clear(); return; }
    // Returning to a page cached before a change: refresh it now.
    const seen = seenAt.current.get(pathname) || 0;
    seenAt.current.set(pathname, Date.now());
    if (seen && lastMutationAt > seen) router.refresh();
  }, [pathname, router]);

  useEffect(() => {
    if (
      pathname === "/" ||
      pathname === "/events-login" ||
      pathname.startsWith("/events-management") ||
      pathname.startsWith("/games-management") ||
      pathname.startsWith("/games/")
    )
      return;
    const refresh = () => {
      if (
        document.visibilityState !== "visible" ||
        Date.now() - lastRefresh.current < 1000
      )
        return;
      lastRefresh.current = Date.now();
      router.refresh();
      window.setTimeout(
        () => window.dispatchEvent(new Event("portal:data-refreshed")),
        750,
      );
      window.setTimeout(
        () => window.dispatchEvent(new Event("portal:data-refreshed")),
        2000,
      );
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const timer = window.setInterval(refresh, REFRESH_INTERVAL_MS);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [pathname, router]);

  return null;
}
