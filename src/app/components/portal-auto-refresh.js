"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

const REFRESH_INTERVAL_MS = 10000;

export default function PortalAutoRefresh() {
  const router = useRouter();
  const pathname = usePathname();
  const lastRefresh = useRef(0);

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
