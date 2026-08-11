"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const types = [
  ["overall", "Overall"],
  ["streamers", "Streamers"],
  ["listeners", "Listeners"],
  ["liveRooms", "Live Rooms"],
  ["earners", "Earners"],
];
const periods = [
  ["today", "Today"],
  ["week", "This Week"],
  ["month", "This Month"],
  ["allTime", "All Time"],
];

export default function RankingsView({ type, period, generatedAt, podium, rankings, totalRanked, page, totalPages }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [selected, setSelected] = useState(null);
  const href = (nextType, nextPeriod, nextPage = 1) =>
    `/rankings?type=${encodeURIComponent(nextType)}&period=${encodeURIComponent(nextPeriod)}&page=${nextPage}`;
  return (
    <>
      <section className="overflow-hidden rounded-2xl border border-[#dce8e5] bg-white">
        <div className="overflow-x-auto border-b border-[#e5ecea] px-4">
          <div className="flex min-w-max gap-1">
            {types.map(([value, label]) => (
              <Link key={value} href={href(value, period)} className={`relative px-4 py-4 text-xs font-bold ${type === value ? "text-[#087f74] after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-[#087f74]" : "text-[#738681] hover:text-[#294a45]"}`}>
                {label}
              </Link>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {periods.map(([value, label]) => (
              <Link key={value} href={href(type, value)} className={`rounded-lg border px-3 py-2 text-[10px] font-bold ${period === value ? "border-[#16877d] bg-[#e7f5f2] text-[#087f74]" : "border-[#dce6e4] text-[#6f827d] hover:bg-[#f5f9f8]"}`}>
                {label}
              </Link>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-[#80918d]">Generated {new Date(generatedAt).toUTCString()}</span>
            <button type="button" disabled={refreshing} onClick={() => startRefresh(() => router.refresh())} className="rounded-lg border border-[#d4e3e0] px-3 py-2 text-[10px] font-bold text-[#087f74] disabled:opacity-50">
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-3">
        {podium.map((entry) => (
          <article key={entry.publicId} className={`rounded-2xl border bg-white p-5 shadow-[0_8px_26px_rgba(15,65,60,.05)] ${entry.rank === 1 ? "border-amber-300 md:-translate-y-2" : "border-[#dce8e5]"}`}>
            <div className="flex items-center justify-between">
              <span className={`grid h-9 w-9 place-items-center rounded-full text-sm font-black ${entry.rank === 1 ? "bg-amber-100 text-amber-700" : entry.rank === 2 ? "bg-slate-100 text-slate-600" : "bg-orange-50 text-orange-700"}`}>#{entry.rank}</span>
              <UserBadges entry={entry} />
            </div>
            <div className="mt-5 flex items-center gap-3">
              <Avatar entry={entry} />
              <div className="min-w-0">
                <Link href={`/users/${encodeURIComponent(entry.publicId)}`} target="_blank" className="block truncate text-sm font-bold hover:text-[#087f74]">{entry.fullName}</Link>
                <p className="truncate text-[10px] text-[#81938e]">{entry.displayId} · {entry.publicId}</p>
              </div>
            </div>
            <p className="mt-5 text-2xl font-black">{formatScore(entry.score)}</p>
            <div className="mt-1 flex items-center justify-between text-[10px] text-[#71847f]">
              <span>{entry.scoreLabel}</span>
              <button type="button" onClick={() => setSelected(entry)} className="font-bold text-[#087f74]">Score details</button>
            </div>
          </article>
        ))}
        {!podium.length && <p className="col-span-full rounded-2xl border border-dashed border-[#cbded9] bg-white p-10 text-center text-sm text-[#71847f]">No qualifying activity exists for this ranking period.</p>}
      </section>

      <section className="mt-6 overflow-hidden rounded-2xl border border-[#dce8e5] bg-white">
        <div className="flex items-center justify-between border-b border-[#e5ecea] px-5 py-4">
          <div><h3 className="text-sm font-bold">Leaderboard</h3><p className="mt-1 text-[10px] text-[#80918d]">{totalRanked.toLocaleString()} ranked users</p></div>
          <p className="text-[10px] font-semibold text-[#71847f]">Page {page} of {totalPages}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-left text-xs">
            <thead><tr className="bg-[#f8fbfa] text-[10px] tracking-wider text-[#758883] uppercase"><th className="px-5 py-3.5">Rank</th><th>User</th><th>Display ID</th><th>VIP</th><th>Live</th><th>Score</th><th className="px-5 text-right">Details</th></tr></thead>
            <tbody className="divide-y divide-[#edf2f1]">
              {rankings.map((entry) => (
                <tr key={entry.publicId} className="hover:bg-[#f9fcfb]">
                  <td className="px-5 py-4 text-sm font-black text-[#087f74]">#{entry.rank}</td>
                  <td><div className="flex items-center gap-3"><Avatar entry={entry} small /><div><Link href={`/users/${encodeURIComponent(entry.publicId)}`} target="_blank" className="font-bold hover:text-[#087f74]">{entry.fullName}</Link><p className="text-[9px] text-[#82938f]">{entry.publicId}</p></div></div></td>
                  <td className="font-mono text-[10px]">{entry.displayId}</td>
                  <td>VIP {entry.vipLevel}</td>
                  <td>{entry.isLive ? <Link href="/users?tab=Audio%20Room%20Records" className="font-bold text-emerald-700">{entry.liveRoomId}</Link> : <span className="text-[#9aa8a5]">Offline</span>}</td>
                  <td><strong>{formatScore(entry.score)}</strong><span className="ml-1 text-[9px] text-[#81938e]">{entry.scoreLabel}</span></td>
                  <td className="px-5 text-right"><button type="button" onClick={() => setSelected(entry)} className="rounded-lg bg-[#e7f5f2] px-3 py-2 text-[10px] font-bold text-[#087f74]">View score</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rankings.length && podium.length > 0 && <p className="py-14 text-center text-sm text-[#788b87]">No additional users appear after the podium.</p>}
        </div>
        <div className="flex items-center justify-between border-t border-[#e8efed] px-5 py-4">
          <Link aria-disabled={page <= 1} href={page > 1 ? href(type, period, page - 1) : href(type, period, 1)} className={`rounded-lg border px-4 py-2 text-[10px] font-bold ${page <= 1 ? "pointer-events-none opacity-40" : "hover:bg-[#f5f9f8]"}`}>Previous</Link>
          <Link aria-disabled={page >= totalPages} href={page < totalPages ? href(type, period, page + 1) : href(type, period, totalPages)} className={`rounded-lg border px-4 py-2 text-[10px] font-bold ${page >= totalPages ? "pointer-events-none opacity-40" : "hover:bg-[#f5f9f8]"}`}>Next</Link>
        </div>
      </section>
      {selected && <ScoreModal entry={selected} type={type} period={period} onClose={() => setSelected(null)} />}
    </>
  );
}

function Avatar({ entry, small = false }) {
  const usableImage = /^(https?:\/\/|\/)/.test(entry.profileImage ?? "");
  return <span className={`relative grid shrink-0 place-items-center rounded-full bg-[#e5f4f1] font-black text-[#087f74] ${small ? "h-9 w-9 text-[10px]" : "h-12 w-12 text-xs"}`} style={usableImage ? { backgroundImage: `url(${entry.profileImage})`, backgroundPosition: "center", backgroundSize: "cover" } : undefined}>
    {!usableImage && initials(entry.fullName)}
    {entry.frameUrl && <span className="pointer-events-none absolute -inset-1 bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url(${entry.frameUrl})` }} />}
  </span>;
}

function UserBadges({ entry }) {
  return <div className="flex items-center gap-1.5">{entry.isOfficial && <span className="rounded-full bg-blue-50 px-2 py-1 text-[9px] font-bold text-blue-700">Official</span>}{entry.isVerified && <span className="rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-bold text-emerald-700">Verified</span>}{entry.badgeUrl && <span className="h-6 w-6 bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url(${entry.badgeUrl})` }} />}</div>;
}

function ScoreModal({ entry, type, period, onClose }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-[#071f1d]/65 p-4" role="dialog" aria-modal="true" aria-labelledby="score-modal-title"><div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"><div className="flex items-start justify-between border-b border-[#e5ecea] px-6 py-5"><div><p className="text-[10px] font-bold tracking-widest text-[#16877d] uppercase">{type} · {period}</p><h3 id="score-modal-title" className="mt-1 text-lg font-bold">{entry.fullName}</h3><p className="mt-1 text-xs text-[#71847f]">Rank #{entry.rank} · {entry.publicId}</p></div><button type="button" onClick={onClose} aria-label="Close score details" className="rounded-lg p-2 text-xl text-[#71847f] hover:bg-[#f1f6f5]">×</button></div><div className="p-6"><div className="rounded-xl bg-[#eaf7f4] p-4"><p className="text-[10px] font-bold text-[#4f726c]">Calculated score</p><p className="mt-1 text-2xl font-black text-[#087f74]">{formatScore(entry.score)}</p><p className="text-[10px] text-[#5f7772]">{entry.scoreLabel}</p></div><div className="mt-5 divide-y divide-[#edf2f1] rounded-xl border border-[#e0eae8]">{entry.breakdown?.map((item) => <div key={item.label} className="flex items-center justify-between px-4 py-3 text-xs"><div><strong>{item.label}</strong>{item.count !== undefined && <p className="mt-0.5 text-[9px] text-[#81938e]">{item.count} ledger entries</p>}</div><span className="font-mono font-bold">{formatScore(item.value)}</span></div>)}{!entry.breakdown?.length && <p className="p-6 text-center text-xs text-[#81938e]">No score components are available.</p>}</div><p className="mt-4 text-[10px] leading-4 text-[#81938e]">Calculated from trusted wallet, gift, and room records. Mobile clients cannot submit or modify ranking scores.</p></div><div className="border-t border-[#e5ecea] bg-[#fafcfc] px-6 py-4"><button type="button" onClick={onClose} className="w-full rounded-lg bg-[#087f74] px-4 py-2.5 text-xs font-bold text-white">Close</button></div></div></div>;
}

function initials(value) { return String(value).split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "U"; }
function formatScore(value) { try { return BigInt(value).toLocaleString(); } catch { return String(value); } }
