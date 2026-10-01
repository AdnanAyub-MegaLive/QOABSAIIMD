"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

function csrf() {
  return decodeURIComponent(document.cookie.split("; ").find((part) => part.startsWith("streamline_events_csrf="))?.split("=")[1] || "");
}

export default function EventsSessionKeeper() {
  const router = useRouter();
  useEffect(() => {
    async function refresh() {
      const response = await fetch("/events-auth/refresh", {
        method: "POST",
        headers: { "x-events-csrf": csrf() },
      });
      if (response.status === 401) {
        router.replace("/events-login");
        router.refresh();
      }
    }
    const timer = window.setInterval(refresh, 10 * 60_000);
    return () => window.clearInterval(timer);
  }, [router]);
  return null;
}
