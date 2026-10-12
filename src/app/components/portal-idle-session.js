"use client";

import { useEffect } from "react";
import { SessionProvider, useSession, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import { permissionForPage } from "@/lib/portal-permissions";

function ActivityTracker() {
  const { status, update } = useSession();
  useEffect(() => {
    if (status === "unauthenticated") {
      window.location.replace("/?reason=session-expired");
      return;
    }
    if (status !== "authenticated") return;
    let pending = false, dirty = false, stopped = false;
    const activity = event => { if (event.isTrusted) dirty = true; };
    const events = ["pointerdown", "pointermove", "keydown", "scroll", "touchstart"];
    events.forEach(name => window.addEventListener(name, activity, { passive: true }));
    const check = async () => {
      if (pending || stopped) return;
      pending = true;
      try {
        // Fetch the shared cookie first: activity in another tab may have renewed it.
        const current = await update();
        if (!current?.user) { stopped = true; await signOut({ callbackUrl: "/?reason=session-expired" }); return; }
        if (dirty) { dirty = false; await update({ portalActivity: true }); }
      } finally { pending = false; }
    };
    const timer = setInterval(() => { check().catch(() => {}); }, 15000);
    return () => { stopped = true; clearInterval(timer); events.forEach(name => window.removeEventListener(name, activity)); };
  }, [status, update]);
  return null;
}

export default function PortalIdleSession() {
  const pathname = usePathname();
  if (!permissionForPage(pathname) && pathname !== "/access-denied") return null;
  return <SessionProvider refetchOnWindowFocus={false}><ActivityTracker /></SessionProvider>;
}
