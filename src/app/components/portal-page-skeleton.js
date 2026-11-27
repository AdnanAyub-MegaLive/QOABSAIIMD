"use client";
import { usePathname } from "next/navigation";
import PortalSidebar from "./portal-sidebar";

function Rows({ count = 6 }) {
  return <div className="space-y-3">{Array.from({ length: count }, (_, n) => <div key={n} className="h-11 animate-pulse rounded-lg bg-[#e8f0ee]" />)}</div>;
}

/** Shown the instant a portal page is opened while its live data streams in. */
export default function PortalPageSkeleton() {
  const pathname = usePathname() || "";
  const bare = pathname === "/" || pathname.startsWith("/events");
  const body = <div role="status" aria-live="polite" className="space-y-6 p-6 lg:p-8">
    <span className="sr-only">Loading…</span>
    <div className="h-8 w-64 animate-pulse rounded-lg bg-[#dfe9e6]" />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[1, 2, 3, 4].map(n => <div key={n} className="h-24 animate-pulse rounded-xl bg-white shadow-sm" />)}</div>
    <div className="portal-panel rounded-xl bg-white p-5 shadow-sm"><Rows /></div>
  </div>;
  if (bare) return <main className="min-h-screen bg-[#f4f8f7]">{body}</main>;
  return <main className="portal-ui min-h-screen bg-[#f4f8f7] text-[#142c2a]"><PortalSidebar /><section id="portal-content" className="lg:pl-64">{body}</section></main>;
}
