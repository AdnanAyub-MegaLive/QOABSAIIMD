"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const sections = [
  ["Control Center", "/room-management"],
  ["Daily Tasks", "/daily-tasks"],
  ["Red Envelopes", "/red-envelopes"],
  ["Appearance", "/room-appearance"],
  ["Live Video", "/live-video-management"],
  ["Notifications", "/notifications-management"],
  ["Content Safety", "/content-moderation"],
];

export default function RoomManagementTabs() {
  const pathname = usePathname();
  return (
    <nav className="mb-7 overflow-x-auto border-b border-[#dce7e4]" aria-label="Room management sections">
      <div className="flex min-w-max gap-1">
        {sections.map(([label, href]) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`relative px-4 py-3 text-xs font-semibold transition ${active ? "text-[#087f74] after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-[#087f74]" : "text-[#71847f] hover:text-[#294a45]"}`}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
