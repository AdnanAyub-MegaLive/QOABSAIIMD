"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import BrandLogo from "./brand-logo";

export const portalNavigation = [
  ["Overview", "/home"],
  ["Users / Senders", "/users"],
  ["Host Management", "/talents"],
  ["Agency Management", "/agencies"],
  ["Finance & Wallet", "/finance"],
  ["Rules & Profit Split", "/platform-rules"],
  ["Uploads", "/uploads"],
  ["Daily Tasks", "/daily-tasks"],
  ["Red Envelopes", "/red-envelopes"],
  ["Rankings", "/rankings"],
  ["Message History", "/messages"],
  ["Audit Logs", "/audit-logs"],
  ["Events Management", "/events-login"],
  ["Games Management", "/games-management"],
  // ["Live Streams", "#"],
  // ["Audio Rooms", "#"],
  // ["Reports", "#"],
];

function isActiveRoute(pathname, href) {
  if (href === "/home") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function PortalSidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-[#092f2d] px-5 py-7 text-white lg:flex">
      <Link href="/home" className="px-2" aria-label="Mega Live Portal dashboard">
        <BrandLogo light compact priority />
      </Link>
      <nav className="mt-12 space-y-1" aria-label="Portal navigation">
        {portalNavigation.map(([label, href]) => {
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
      <div className="mt-auto border-t border-white/10 pt-5 text-xs text-[#82a6a1]">
        Mega Live Portal
        <br />
        Control center
      </div>
    </aside>
  );
}
