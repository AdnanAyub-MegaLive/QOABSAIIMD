"use client";

import { useRouter } from "next/navigation";

function csrf() {
  return decodeURIComponent(document.cookie.split("; ").find((part) => part.startsWith("streamline_events_csrf="))?.split("=")[1] || "");
}

export default function EventsLogoutButton() {
  const router = useRouter();
  return <button onClick={async () => {
    await fetch("/events-auth/logout", { method: "POST", headers: { "x-events-csrf": csrf() } });
    router.replace("/events-login");
    router.refresh();
  }} className="mt-4 w-full rounded-lg border border-white/20 px-3 py-2 text-sm font-semibold hover:bg-white/10">Sign out</button>;
}
