"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { canAccessPage, hasPermission, permissionForPage } from "@/lib/portal-permissions";

const Access = createContext(null);
export function usePortalAccess() { return useContext(Access); }
export default function PortalAccessProvider({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const accessSignature = useRef(null);
  const [admin, setAdmin] = useState(null);
  useEffect(() => {
    if (!permissionForPage(pathname) && pathname !== "/access-denied" && pathname !== '/database-management') return;
    let alive = true, pending = false;
    async function refresh() {
      if (pending) return;
      pending = true;
      try {
        const response = await fetch("/api/admin/access", { cache: "no-store" });
        const json = await response.json();
        if (!alive) return;
        const next = response.ok ? json.data : null;
        const signature = JSON.stringify(next && {id:next.id,role:next.role,active:next.active,sessionVersion:next.sessionVersion,permissions:[...next.permissions].sort(),databaseOwner:next.databaseOwner});
        setAdmin(next);
        if (response.status === 401) { window.location.replace('/?reason=session-expired'); return; }
        // A parent's revoked grant also changes effective access, even when
        // this account's own session version did not change.
        if (accessSignature.current !== null && accessSignature.current !== signature) router.refresh();
        accessSignature.current = signature;
      }
      catch { if (alive) setAdmin(null); } finally { pending = false; }
    }
    refresh();
    window.addEventListener("focus", refresh);
    const visible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('pageshow', refresh);
    const timer = window.setInterval(refresh, 15000);
    return () => { alive = false; clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener('visibilitychange', visible); window.removeEventListener('pageshow', refresh); };
  }, [pathname, router]);
  const protectedPage = Boolean(permissionForPage(pathname)) || pathname === '/database-management';
  const allowed = pathname === '/database-management' ? admin?.databaseOwner : canAccessPage(admin, pathname);
  return <Access.Provider value={admin}>{protectedPage && !allowed ? <p role="status" className="p-6">Checking access. If access was removed, sign in with an authorized account.</p> : children}</Access.Provider>;
}
export function PermissionGate({permission, children}) {
  return hasPermission(usePortalAccess(), permission) ? children : null;
}
export function PermissionButton({ permission, children, ...props }) {
  const admin = usePortalAccess();
  return hasPermission(admin, permission) ? <button {...props}>{children}</button> : null;
}
export function allowedNavigation(admin, navigation) {
  return navigation.flatMap(([label, href]) => {
    if (href === '/database-management') return admin?.databaseOwner ? [[label,href]] : [];
    if (href === "/room-management") {
      const sections = [href, "/messages", "/daily-tasks", "/red-envelopes", "/room-appearance", "/room-games", "/notifications-management", "/content-moderation"];
      const destination = sections.find(path => canAccessPage(admin, path));
      return destination ? [[label, destination]] : [];
    }
    return canAccessPage(admin, href) ? [[label, href]] : [];
  });
}
