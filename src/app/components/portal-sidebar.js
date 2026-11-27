"use client";

import Link from "next/link";
import NextImage from "next/image";
import { useState } from "react";
import { m } from "framer-motion";
import { LayoutDashboard, Users, UserRoundX, Crown, Mic, Building2, Wallet, SlidersHorizontal, CircleHelp, Megaphone, Image, Radio, Video, Trophy, ScrollText, ShieldCheck, Database, CalendarDays, Gamepad2, ChevronRight, PanelLeftClose, PanelLeftOpen } from "lucide-react";
const navigationIcons = [LayoutDashboard, Users, UserRoundX, Crown, Mic, Building2, Wallet, SlidersHorizontal, CircleHelp, Megaphone, Image, Radio, Video, Trophy, ScrollText, ShieldCheck, Database, CalendarDays, Gamepad2];
const eventIcons = { "/events-management": LayoutDashboard, "/events-management/events": CalendarDays, "/events-management/events/upload": Image, "/events-management/published": ShieldCheck, "/events-management/drafts": ScrollText, "/events-management/users": Users, "/events-management/logs": ScrollText, "/events-management/settings": SlidersHorizontal };
function NavigationIcon({ href }) { const Icon = eventIcons[href] || navigationIcons[portalNavigation.findIndex(([,route]) => route === href)] || LayoutDashboard; return <Icon size={17} strokeWidth={1.7} aria-hidden="true" className="shrink-0" />; }

import { usePathname } from "next/navigation";
import IntentLink from "./intent-link";

import { allowedNavigation, usePortalAccess } from "./portal-access";

export const portalNavigation = [
  ["Overview", "/home"],
  ["My Region", "/region-report"],
  ["Users / Senders", "/users"],
  ["Account deletion", "/account-deletions"],
  ["VIP Management", "/vip-management"],
  ["Host Management", "/talents"],
  ["Agency Management", "/agencies"],
  ["Finance & Wallet", "/finance"],
  ["Rules & Profit Split", "/platform-rules"],
  ["Help Center", "/help-center"],
  ["Global Announcements", "/platform-rules/global-announcements"],
  ["Uploads", "/uploads"],
  ["Room Management", "/room-management"],
  ["Live Management", "/live-management"],
  ["Rankings", "/rankings"],
  ["Audit Logs", "/audit-logs"],
  ["Accounts & Permissions", "/accounts-permissions"],
  ["Database Management", "/database-management"],
  ["Events Management", "/events-login"],
  ["Games Management", "/games-management"],
  // ["Live Streams", "#"],
  // ["Audio Rooms", "#"],
  // ["Reports", "#"],
];

function isActiveRoute(pathname, href) {
  if (href === "/events-management" || href === "/events-management/events") return pathname === href;
  if (href === "/home") return pathname === href;
  if (href === "/room-management") {
    return [
      "/room-management",
      "/room-rocket",
      "/cp-levels",
      "/messages",
      "/daily-tasks",
      "/red-envelopes",
      "/room-appearance",
      "/room-games",

      "/notifications-management",
      "/content-moderation",
    ].some((route) => pathname === route || pathname.startsWith(`${route}/`));
  }
  if (href === "/platform-rules" && pathname.startsWith("/platform-rules/global-announcements")) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function PortalSidebar() {
  const pathname = usePathname();
  const navigation = allowedNavigation(usePortalAccess(), portalNavigation);

  return <SidebarView pathname={pathname} navigation={navigation}/>;
}

export function SidebarView({ pathname, navigation, workspace = "Administration", footer }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <>
    <a className="portal-skip-link" href="#portal-content" onClick={() => document.getElementById("portal-content")?.focus()}>Skip to content</a>
    <div className="border-b border-white/10 bg-[#092f2d] px-6 py-3 text-white lg:hidden">
      <details key={pathname} className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-lg py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#62e0d0]">
          <span className="flex items-center gap-3"><NextImage src="/mega-portal-logo.png" alt="Mega Live" width={34} height={34} className="rounded-lg" /><span>Mega Live · {workspace}</span></span><span className="text-[#62e0d0]">Menu <span aria-hidden="true">☰</span></span>
        </summary>
        <nav aria-label="Mobile portal navigation" className="grid max-h-[65vh] gap-1 overflow-y-auto pb-2 pt-3 sm:grid-cols-2">
          {navigation.map(([label, href]) => <IntentLink key={href} href={href} aria-current={isActiveRoute(pathname, href) ? "page" : undefined} className={`flex items-center gap-3 rounded-lg px-3 py-3 text-sm ${isActiveRoute(pathname, href) ? "bg-[#d9f6ed] font-semibold text-[#0b5148]" : "text-[#a9c5c1] hover:bg-white/5 hover:text-white"}`}><NavigationIcon href={href}/>{label}</IntentLink>)}
        </nav>
        {footer && <div className="border-t border-white/10 py-3">{footer}</div>}
      </details>
    </div>
    <m.aside initial={{ opacity: 0 }} animate={{ opacity: 1 }} data-collapsed={collapsed} className="portal-sidebar fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-[linear-gradient(160deg,#103b36,#082b29)] px-4 py-6 text-white lg:flex">
      <div className="ops-brand-row"><Link href="/home" className="ops-brand" aria-label="Mega Live Portal dashboard"><NextImage className="ops-brand-mark" src="/mega-portal-logo.png" alt="Mega Live" width={34} height={34} priority /><span className="ops-brand-copy">Mega Live<small>{workspace}</small></span></Link><button type="button" className="ops-rail-toggle" aria-label={collapsed ? "Expand navigation" : "Collapse navigation"} aria-expanded={!collapsed} onClick={() => setCollapsed(v => !v)}>{collapsed ? <PanelLeftOpen size={17}/> : <PanelLeftClose size={17}/>}</button></div>
      <nav className="[scrollbar-width:thin] [scrollbar-color:#365c56_transparent] mt-7 min-h-0 flex-1 space-y-1 overflow-y-auto pb-4" aria-label="Portal navigation">
        {navigation.map(([label, href]) => {
          const active = isActiveRoute(pathname, href);
          return (
            <IntentLink
              key={href}
              title={label}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] transition-colors ${
                active
                  ? "bg-[#d9f6ed] font-semibold text-[#0b5148]"
                  : "text-[#a9c5c1] hover:bg-white/5 hover:text-white"
              }`}
            >
              <NavigationIcon href={href}/><span className="ops-nav-label flex-1">{label}</span>{active && <ChevronRight size={14} aria-hidden="true"/>}
            </IntentLink>
          );
        })}
      </nav>
      <div className="shrink-0 border-t border-white/10 pt-4 text-xs leading-relaxed text-[#82a6a1]">
        {footer || <><span className="ops-online-dot"/> Mega Live Ops<br />Operational workspace</>}
      </div>
    </m.aside>
    </>
  );
}
