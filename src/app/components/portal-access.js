"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { canAccessPage, hasPermission, permissionForPage } from "@/lib/portal-permissions";

const Access = createContext(null);
export function usePortalAccess() { return useContext(Access); }
export default function PortalAccessProvider({ children }) {
  const pathname = usePathname();
  const [admin, setAdmin] = useState(null);
  useEffect(() => {
    if (!permissionForPage(pathname) && pathname !== "/access-denied") return;
    let alive = true, pending = false;
    async function refresh() {
      if (pending) return;
      pending = true;
      try { const response = await fetch("/api/admin/access", { cache: "no-store" }); const json = await response.json(); if (alive) setAdmin(response.ok ? json.data : null); }
      catch { if (alive) setAdmin(null); } finally { pending = false; }
    }
    refresh();
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 15000);
    return () => { alive = false; clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [pathname]);
  return <Access.Provider value={admin}>{children}</Access.Provider>;
}
export function PermissionButton({ permission, children, ...props }) {
  const admin = usePortalAccess();
  return hasPermission(admin, permission) ? <button {...props}>{children}</button> : null;
}
export function allowedNavigation(admin, navigation) {
  return navigation.flatMap(([label, href]) => {
    if (href === "/room-management") {
      const sections = [href, "/daily-tasks", "/red-envelopes", "/room-appearance", "/room-games", "/live-video-management", "/notifications-management", "/content-moderation"];
      const destination = sections.find(path => canAccessPage(admin, path));
      return destination ? [[label, destination]] : [];
    }
    return canAccessPage(admin, href) ? [[label, href]] : [];
  });
}
