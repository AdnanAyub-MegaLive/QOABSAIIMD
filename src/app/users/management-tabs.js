"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import UsersTable from "./users-table";
import DeviceInformationTable from "../components/device-information-table";
import GiftHistoryTable from "./gift-history-table";
import BlockedUsersTable from "./blocked-users-table";
import RecordTable from "../components/record-table";
import AudioRoomTable from "./audio-room-table";
import ServerPager from "../components/server-pager";

const tabs = [
  "User List",
  "Gift Sending History",
  "Audio Room Records",
  "Device Information",
  "Blocked and Banned User",
  "User Album",
  "User Top History",
  "Game logs",
];
export default function ManagementTabs({
  users,
  devices,
  modules,
  audioRooms,
  specialIdCatalog,
  canAdjustCoins = false,
  paging = null,
}) {
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState(
    tabs.includes(requestedTab) ? requestedTab : tabs[0],
  );
  // `users` holds this page plus banned accounts (for the ban tab); lists show the page.
  const pageIds = paging ? new Set(paging.pageUserIds) : null;
  const pageUsers = pageIds ? users.filter((user) => pageIds.has(user.id)) : users;
  const totalUsers = paging?.totalUsers ?? users.length;
  const activeUsers = paging?.activeUsers ?? users.filter((user) => user.status === "Active").length;
  const vipUsers = paging?.vipUsers ?? users.filter((user) => user.vipLevel > 0).length;
  const stats = [
    ["Total users", totalUsers.toLocaleString(), "Stored accounts"],
    ["Active users", activeUsers.toLocaleString(), `${totalUsers ? Math.round((activeUsers / totalUsers) * 100) : 0}% of users`],
    ["Device records", (paging?.deviceTotal ?? devices.length).toLocaleString(), "Application login devices"],
    ["VIP users", vipUsers.toLocaleString(), `${totalUsers ? Math.round((vipUsers / totalUsers) * 100) : 0}% of users`],
  ];
  // Tables keep local state from their first data; remount them for each page.
  const pageKey = paging ? `${paging.page}:${paging.pageUserIds.join(",")}` : "all";
  const pager = paging ? <ServerPager page={paging.page} hasNext={paging.hasNext} total={paging.totalUsers} label="users" search /> : null;
  return (
    <>
      <div
        className="mb-7 overflow-x-auto border-b border-[#dce7e4]"
        role="tablist"
        aria-label="User management sections"
      >
        <div className="flex min-w-max gap-1">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`relative px-4 py-3 text-xs font-semibold transition ${activeTab === tab ? "text-[#087f74] after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-[#087f74]" : "text-[#71847f] hover:text-[#294a45]"}`}
              role="tab"
              aria-selected={activeTab === tab}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>
      <section role="tabpanel">
        {activeTab === "User List" ? (
          <>
            <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {stats.map(([label, value, note]) => (
                <div
                  key={label}
                  className="rounded-xl border border-[#dfe9e7] bg-white p-5"
                >
                  <p className="text-[11px] font-semibold text-[#768984]">
                    {label}
                  </p>
                  <p className="mt-2 text-2xl font-bold">{value}</p>
                  <p className="mt-2 text-[10px] text-[#429387]">{note}</p>
                </div>
              ))}
            </div>
            {pager}
            <UsersTable
              key={pageKey}
              canAdjustCoins={canAdjustCoins}
              initialData={pageUsers}
              specialIdCatalog={specialIdCatalog}
            />
          </>
        ) : activeTab === "Gift Sending History" ? (
          <>{pager}<GiftHistoryTable key={pageKey} initialData={pageUsers} /></>
        ) : activeTab === "Audio Room Records" ? (
          <AudioRoomTable initialRooms={audioRooms} />
        ) : activeTab === "Device Information" ? (
          <DeviceInformationTable
            title="User Device Information"
            records={devices}
          />
        ) : activeTab === "Blocked and Banned User" ? (
          <BlockedUsersTable initialUsers={users} initialDevices={devices} />
        ) : activeTab === "User Album" ? (
          <RecordTable
            title="User Album"
            description="Uploaded profile album media and moderation status."
            rows={modules.albums}
            columns={[
              { key: "userId", label: "User ID", mono: true },
              { key: "user", label: "User" },
              { key: "type", label: "Media type" },
              { key: "caption", label: "Caption" },
              { key: "status", label: "Status", badge: true },
              { key: "uploaded", label: "Uploaded" },
            ]}
          />
        ) : activeTab === "User Top History" ? (
          <RecordTable
            title="User Top History"
            description="Current sender ranking based on total gift spending."
            rows={modules.topHistory}
            columns={[
              { key: "rank", label: "Rank" },
              { key: "userId", label: "User ID", mono: true },
              { key: "user", label: "User" },
              { key: "totalSpent", label: "Total spent" },
              { key: "gifts", label: "Gifts sent" },
              { key: "vip", label: "VIP", badge: true },
            ]}
          />
        ) : activeTab === "Game logs" ? (
          <RecordTable
            title="Game Logs"
            description="User wagers, payouts and game outcomes."
            rows={modules.gameLogs}
            columns={[
              { key: "reference", label: "Reference", mono: true },
              { key: "userId", label: "User ID", mono: true },
              { key: "user", label: "User" },
              { key: "game", label: "Game" },
              { key: "wager", label: "Wager" },
              { key: "payout", label: "Payout" },
              { key: "result", label: "Result", badge: true },
              { key: "played", label: "Played" },
            ]}
          />
        ) : null}
      </section>
    </>
  );
}
