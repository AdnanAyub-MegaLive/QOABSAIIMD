"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import BrandLogo from "./brand-logo";
import { allowedNavigation, usePortalAccess } from "./portal-access";

export const portalNavigation = [
  ["Overview", "/home"],
  ["Users / Senders", "/users"],
  ["Host Management", "/talents"],
  ["Agency Management", "/agencies"],
  ["Finance & Wallet", "/finance"],
  ["Rules & Profit Split", "/platform-rules"],
  ["Uploads", "/uploads"],
  ["Room Management", "/room-management"],
  ["Live Management", "/live-management"],
  ["Rankings", "/rankings"],
  ["Audit Logs", "/audit-logs"],
  ["Accounts & Permissions", "/accounts-permissions"],
  ["Events Management", "/events-login"],
  ["Games Management", "/games-management"],
  // ["Live Streams", "#"],
  // ["Audio Rooms", "#"],
  // ["Reports", "#"],
];

function isActiveRoute(pathname, href) {
  if (href === "/home") return pathname === href;
  if (href === "/room-management") {
    return [
      "/room-management",
      "/messages",
      "/daily-tasks",
      "/red-envelopes",
      "/room-appearance",
      "/room-games",

      "/notifications-management",
      "/content-moderation",
    ].some((route) => pathname === route || pathname.startsWith(`${route}/`));
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function PortalSidebar() {
  const pathname = usePathname();
  const navigation = allowedNavigation(usePortalAccess(), portalNavigation);

  return (
    <>
    <div className="border-b border-white/10 bg-[#092f2d] px-6 py-3 text-white lg:hidden">
      <details key={pathname} className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-lg py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#62e0d0]">
          <span>Mega Live Portal</span><span className="text-[#62e0d0]">Menu <span aria-hidden="true">☰</span></span>
        </summary>
        <nav aria-label="Mobile portal navigation" className="grid max-h-[65vh] gap-1 overflow-y-auto pb-2 pt-3 sm:grid-cols-2">
          {navigation.map(([label, href]) => <Link key={href} href={href} aria-current={isActiveRoute(pathname, href) ? "page" : undefined} className={`rounded-lg px-3 py-3 text-sm ${isActiveRoute(pathname, href) ? "bg-white/10 font-semibold text-[#62e0d0]" : "text-[#a9c5c1] hover:bg-white/5 hover:text-white"}`}>{label}</Link>)}
        </nav>
      </details>
    </div>
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-[#092f2d] px-5 py-6 text-white lg:flex">
      <Link href="/home" className="px-2" aria-label="Mega Live Portal dashboard">
        <BrandLogo light compact priority />
      </Link>
      <nav className="portal-navigation mt-7 min-h-0 flex-1 space-y-1 overflow-y-auto pb-4" aria-label="Portal navigation">
        {navigation.map(([label, href]) => {
          const active = isActiveRoute(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`block rounded-xl px-4 py-3 text-sm transition-colors ${
                active
                  ? "bg-white/10 font-semibold text-[#62e0d0]"
                  : "text-[#a9c5c1] hover:bg-white/5 hover:text-white"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="shrink-0 border-t border-white/10 pt-4 text-xs leading-relaxed text-[#82a6a1]">
        Mega Live Portal
        <br />
        Control center
      </div>
    </aside>
    </>
  );
}
