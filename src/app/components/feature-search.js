"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { usePortalAccess } from "./portal-access";
import { canAccessPage } from "@/lib/portal-permissions";

const features = [
  ["Accounts & Permissions", "Staff accounts and feature access", "/accounts-permissions"],
  ["Room Games", "Game links, mobile visibility and display order", "/room-games"],
  ["Daily Tasks", "Task categories, rewards and progress targets", "/daily-tasks"],
  ["Live Management", "Live sessions, KYC, gifts, rewards and PK", "/live-management"],
  ["Notification Center", "Manage application announcements and notifications", "/notifications-management"],
  ["Content Safety", "Review posts and social activity", "/content-moderation"],
  ["Events Management", "Host and publish web events for the mobile application", "/events-login"],
  ["Games Management", "Game catalog, odds, bet limits and wallet round logs", "/games-management"],
  ["Red Envelopes", "Manage room Red Envelope presets, limits and countdowns", "/red-envelopes"],
  ["Room Appearance", "Manage room backgrounds, seat styles and custom artwork reviews", "/room-appearance"],
  ["Room Management", "Review room blacklists, permissions and moderation history", "/room-management"],
  ["Dashboard", "Platform overview and activity", "/home"],
  ["Rankings", "Review mobile leaderboards and score calculations", "/rankings"],
  ["Message History", "Trace World Chat, private, and audio-room messages", "/messages"],
  ["Audit Logs", "Review all portal and administrator activity", "/audit-logs"],
  ["Users / Senders", "Manage users and gift senders", "/users"],
  ["User List", "Browse and filter user accounts", "/users?tab=User%20List"],
  [
    "Gift Sending History",
    "Review gifts sent by users",
    "/users?tab=Gift%20Sending%20History",
  ],
  [
    "User Device Information",
    "Login devices, IP addresses and bans",
    "/users?tab=Device%20Information",
  ],
  [
    "Blocked or Banned Users",
    "Review restricted user accounts",
    "/users?tab=Blocked%20or%20Banned%20User",
  ],
  ["User Level", "Manage user levels", "/users?tab=User%20Level"],
  ["User Album", "Review user album content", "/users?tab=User%20Album"],
  ["Special ID", "Manage special user IDs", "/users?tab=Special%20ID"],
  [
    "User Top History",
    "View user ranking history",
    "/users?tab=User%20Top%20History",
  ],
  ["Game Logs", "Review user game activity", "/users?tab=Game%20logs"],
  ["Host Management", "Manage video and audio hosts", "/talents"],
  [
    "Host Verification",
    "Identity and profile verification",
    "/talents?tab=Verification",
  ],
  [
    "Gifts Received",
    "Review gifts received by hosts",
    "/talents?tab=Gifts%20Received",
  ],
  [
    "Salary History",
    "Review host salary payments",
    "/talents?tab=Salary%20History",
  ],
  [
    "Host Device Information",
    "Host login devices and bans",
    "/talents?tab=Device%20Information",
  ],
  ["Live History", "Review host live sessions", "/talents?tab=Live%20History"],
  [
    "Host Performance",
    "Review performance metrics",
    "/talents?tab=Performance",
  ],
  [
    "Host Violations",
    "Review compliance violations",
    "/talents?tab=Violations",
  ],
  [
    "Agency Management",
    "Manage agencies, rankings, targets and salaries",
    "/agencies",
  ],
  [
    "Rules & Profit Split",
    "Manage host eligibility and gift settlement percentages",
    "/platform-rules",
  ],
  [
    "Agency Tasks",
    "Manage agency targets and tasks",
    "/agencies?tab=Agency%20Tasks",
  ],
  [
    "Monthly Agency Salary",
    "Review agency commission payments",
    "/agencies?tab=Monthly%20Salary",
  ],
  [
    "Host Salaries",
    "Review agency host salary calculations",
    "/agencies?tab=Host%20Salaries",
  ],
  [
    "Agency Apply",
    "Review new agency applications",
    "/agencies?tab=Agency%20Apply",
  ],
  ["Uploads", "Manage mobile application visual assets", "/uploads"],
  ["Banners", "Upload and preview application banners", "/uploads"],
  ["Frames", "Upload and preview profile frames", "/uploads"],
  ["Entrance Strip", "Upload and preview entrance strip effects", "/uploads"],
  ["Rides", "Upload and manage ride effects", "/uploads"],
  ["Tail-lights", "Upload and preview tail-light effects", "/uploads"],
  ["Upload Gifts", "Upload and preview gift assets", "/uploads"],
  ["Badges", "Upload and preview user badges", "/uploads"],
  ["Chat Boxes", "Upload and preview chat boxes", "/uploads"],
  ["Room Backgrounds", "Upload and preview audio-room backgrounds", "/uploads"],
].map(([label, description, href]) => ({ label, description, href }));

export default function FeatureSearch() {
  const router = useRouter();
  const admin = usePortalAccess();
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const results = useMemo(() => {
    const value = query.trim().toLowerCase();
    return (
      value
        ? features.filter((item) =>
            `${item.label} ${item.description}`.toLowerCase().includes(value),
          )
        : features.slice(0, 6)
    ).filter(item => canAccessPage(admin, item.href)).slice(0, 8);
  }, [query, admin]);

  function navigate(href) {
    setQuery("");
    setFocused(false);
    router.push(href);
  }

  return (
    <div className="relative hidden min-w-0 w-full max-w-md md:block">
      <svg
        className="absolute top-1/2 left-3.5 z-10 h-4 w-4 -translate-y-1/2 fill-none stroke-[#7d918c] stroke-2"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </svg>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && results[0]) navigate(results[0].href);
          if (event.key === "Escape") setFocused(false);
        }}
        className="h-10 w-full rounded-xl border border-[#dce6e4] bg-[#f7faf9] pr-10 pl-10 text-xs text-[#29423d] outline-none placeholder:text-[#94a39f] focus:border-[#2ca89c] focus:bg-white focus:ring-3 focus:ring-[#2ca89c]/10"
        placeholder="Search all features..."
        aria-label="Search all portal features"
      />
      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 rounded border border-[#d8e2e0] bg-white px-1.5 py-0.5 text-[8px] font-bold text-[#8a9a96]">
        ↵
      </span>
      {focused && (
        <div className="absolute top-[calc(100%+8px)] left-0 z-50 w-full overflow-hidden rounded-xl border border-[#dce7e4] bg-white shadow-[0_18px_45px_rgba(11,52,48,.16)]">
          <p className="border-b border-[#edf2f1] px-4 py-2.5 text-[9px] font-bold tracking-wider text-[#8a9a96] uppercase">
            {query ? "Search results" : "Quick access"}
          </p>
          {results.length ? (
            results.map((item) => (
              <button
                key={`${item.label}-${item.href}`}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => navigate(item.href)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[#f3f8f7]"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#e6f4f1] text-sm font-bold text-[#087f74]">
                  {item.label[0]}
                </span>
                <span>
                  <strong className="block text-[11px] text-[#29423d]">
                    {item.label}
                  </strong>
                  <span className="mt-0.5 block text-[9px] text-[#82938f]">
                    {item.description}
                  </span>
                </span>
                <span className="ml-auto text-xs text-[#8ca09b]">→</span>
              </button>
            ))
          ) : (
            <p className="px-4 py-8 text-center text-xs text-[#80918d]">
              No matching features found.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
