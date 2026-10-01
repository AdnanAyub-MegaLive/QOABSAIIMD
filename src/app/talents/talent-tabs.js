"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import DeviceInformationTable from "../components/device-information-table";
import RecordTable from "../components/record-table";

const tabs = [
  "Host List",
  "Verification",
  "Gifts Received",
  "Salary History",
  "Device Information",
  "Live History",
  "Performance",
  "Violations",
];
export default function TalentTabs({ initialTalents, devices, modules }) {
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const [active, setActive] = useState(
    tabs.includes(requestedTab) ? requestedTab : tabs[0],
  );
  return (
    <>
      <div
        className="mb-7 overflow-x-auto border-b border-[#dce7e4]"
        role="tablist"
        aria-label="Host management sections"
      >
        <div className="flex min-w-max gap-1">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActive(tab)}
              className={`relative px-4 py-3 text-xs font-semibold transition ${active === tab ? "text-[#087f74] after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-[#087f74]" : "text-[#71847f] hover:text-[#294a45]"}`}
              role="tab"
              aria-selected={active === tab}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>
      <section role="tabpanel">
        {active === "Host List" ? (
          <TalentList talents={initialTalents} />
        ) : active === "Device Information" ? (
          <DeviceInformationTable
            title="Host Device Information"
            records={devices}
          />
        ) : active === "Verification" ? (
          <RecordTable
            title="Host Verification"
            description="Identity documents, profile images and verification review status."
            rows={modules.verification}
            columns={[
              { key: "talentId", label: "Host ID", mono: true },
              { key: "talent", label: "Host" },
              { key: "status", label: "Status", badge: true },
              { key: "identityFront", label: "ID front", badge: true },
              { key: "identityBack", label: "ID back", badge: true },
              { key: "profileImage", label: "Profile image", badge: true },
              { key: "submitted", label: "Submitted" },
              { key: "reviewed", label: "Reviewed" },
            ]}
          />
        ) : active === "Gifts Received" ? (
          <RecordTable
            title="Gifts Received"
            description="Gift transactions received by hosts from senders."
            rows={modules.gifts}
            columns={[
              { key: "talentId", label: "Host ID", mono: true },
              { key: "talent", label: "Host" },
              { key: "senderId", label: "Sender ID", mono: true },
              { key: "sender", label: "Sender" },
              { key: "gift", label: "Gift" },
              { key: "quantity", label: "Quantity" },
              { key: "value", label: "Coin value" },
              { key: "received", label: "Received" },
            ]}
          />
        ) : active === "Salary History" ? (
          <RecordTable
            title="Salary History"
            description="Monthly salary calculations and payment status."
            rows={modules.salaries}
            columns={[
              { key: "talentId", label: "Host ID", mono: true },
              { key: "talent", label: "Host" },
              { key: "period", label: "Period" },
              { key: "amount", label: "Amount" },
              { key: "status", label: "Status", badge: true },
              { key: "paid", label: "Paid on" },
              { key: "notes", label: "Notes" },
            ]}
          />
        ) : active === "Live History" ? (
          <RecordTable
            title="Live History"
            description="Completed and active audio/video streaming sessions."
            rows={modules.liveHistory}
            columns={[
              { key: "talentId", label: "Host ID", mono: true },
              { key: "talent", label: "Host" },
              { key: "room", label: "Room", mono: true },
              { key: "type", label: "Type" },
              { key: "started", label: "Started" },
              { key: "duration", label: "Duration" },
              { key: "peakViewers", label: "Peak viewers" },
              { key: "gifts", label: "Gifts" },
              { key: "status", label: "Status", badge: true },
            ]}
          />
        ) : active === "Performance" ? (
          <RecordTable
            title="Host Performance"
            description="Monthly engagement, audience, follower and earning metrics."
            rows={modules.performance}
            columns={[
              { key: "talentId", label: "Host ID", mono: true },
              { key: "talent", label: "Host" },
              { key: "period", label: "Period" },
              { key: "liveMinutes", label: "Live minutes" },
              { key: "viewers", label: "Unique viewers" },
              { key: "followers", label: "New followers" },
              { key: "gifts", label: "Gift value" },
              { key: "engagement", label: "Engagement" },
            ]}
          />
        ) : active === "Violations" ? (
          <RecordTable
            title="Host Violations"
            description="Content, conduct and platform-policy violation records."
            rows={modules.violations}
            columns={[
              { key: "talentId", label: "Host ID", mono: true },
              { key: "talent", label: "Host" },
              { key: "category", label: "Category" },
              { key: "severity", label: "Severity", badge: true },
              { key: "description", label: "Description" },
              { key: "status", label: "Status", badge: true },
              { key: "action", label: "Action taken" },
              { key: "reported", label: "Reported" },
            ]}
          />
        ) : null}
      </section>
    </>
  );
}

function TalentList({ talents }) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const filtered = useMemo(
    () =>
      talents.filter(
        ([name, type, id, status]) =>
          `${name} ${type} ${id} ${status}`
            .toLowerCase()
            .includes(query.trim().toLowerCase()) &&
          (typeFilter === "All" || type === typeFilter) &&
          (statusFilter === "All" || status === statusFilter),
      ),
    [talents, query, typeFilter, statusFilter],
  );
  const videoHosts = talents.filter(
    ([, type]) => type === "Video Streamer" || type === "Video And Audio Host",
  ).length;
  const audioHosts = talents.filter(
    ([, type]) => type === "Audio Room Host" || type === "Video And Audio Host",
  ).length;
  const awaitingVerification = talents.filter(
    ([, , , status]) => status !== "Verified",
  ).length;
  return (
    <>
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Total hosts", talents.length, "Stored host accounts"],
          ["Video streamers", videoHosts, `${talents.length ? Math.round((videoHosts / talents.length) * 100) : 0}% of hosts`],
          ["Audio room hosts", audioHosts, `${talents.length ? Math.round((audioHosts / talents.length) * 100) : 0}% of hosts`],
          ["Awaiting verification", awaitingVerification, "Requires review"],
        ].map(([label, value, note]) => (
          <div
            key={label}
            className="rounded-xl border border-[#dfe9e7] bg-white p-5"
          >
            <p className="text-[11px] font-semibold text-[#768984]">{label}</p>
            <p className="mt-2 text-2xl font-bold">{value}</p>
            <p className="mt-2 text-[10px] text-[#429387]">{note}</p>
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-2xl border border-[#dce8e5] bg-white">
        <div className="flex flex-col gap-3 border-b border-[#e5ecea] p-5 lg:flex-row lg:justify-between">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-10 w-full max-w-xs rounded-lg border border-[#dce6e4] bg-[#fafcfc] px-4 text-xs outline-none focus:border-[#2ca89c] focus:ring-3 focus:ring-[#2ca89c]/10"
            placeholder="Search name, ID, type or status..."
            aria-label="Search hosts"
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              className="h-10 rounded-lg border border-[#dce6e4] bg-white px-3 text-xs text-[#536863]"
              aria-label="Filter by host type"
            >
              <option value="All">All host types</option>
              <option>Video Streamer</option>
              <option>Audio Room Host</option>
            </select>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-10 rounded-lg border border-[#dce6e4] bg-white px-3 text-xs text-[#536863]"
              aria-label="Filter by verification status"
            >
              <option value="All">All verification statuses</option>
              <option>Verified</option>
              <option>Pending</option>
              <option>Review</option>
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead>
              <tr className="bg-[#f8fbfa] text-[10px] tracking-wider text-[#7b8e89] uppercase">
                <th className="px-5 py-3.5">Host</th>
                <th>Type</th>
                <th>Host ID</th>
                <th>Verification</th>
                <th>Gifts received</th>
                <th>Followers</th>
                <th className="px-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf2f1]">
              {filtered.map(([name, type, id, status, gifts, followers]) => (
                <tr key={id} className="text-xs hover:bg-[#f9fcfb]">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <span className="grid h-9 w-9 place-items-center rounded-full bg-[#dff5f1] font-bold text-[#087f74]">
                        {name
                          .split(" ")
                          .map((part) => part[0])
                          .join("")}
                      </span>
                      <strong>{name}</strong>
                    </div>
                  </td>
                  <td className="text-[#60756f]">{type}</td>
                  <td className="font-medium text-[#60756f]">{id}</td>
                  <td>
                    <span
                      className={`rounded-full px-2 py-1 text-[10px] font-bold ${status === "Verified" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}
                    >
                      {status}
                    </span>
                  </td>
                  <td className="font-semibold">{gifts}</td>
                  <td>{followers}</td>
                  <td className="px-5 text-right">
                    <Link
                      href={`/talents/${encodeURIComponent(id)}`}
                      className="rounded-lg border border-[#d7e4e1] px-3 py-2 text-[10px] font-bold text-[#526b67] hover:bg-[#f1f7f5]"
                    >
                      Open profile
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filtered.length && (
            <div className="py-16 text-center text-sm text-[#788b87]">
              No hosts match the selected filters.
            </div>
          )}
        </div>
        <div className="border-t border-[#e8efed] px-5 py-4 text-[10px] text-[#849691]">
          Showing {filtered.length} of {talents.length} hosts
        </div>
      </div>
    </>
  );
}
