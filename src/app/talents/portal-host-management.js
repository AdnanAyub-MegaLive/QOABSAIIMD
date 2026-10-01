"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { managePortalHost } from "../database-actions";

const inputClass =
  "h-10 w-full rounded-lg border border-[#dce6e4] bg-white px-3 text-xs text-[#29423d] outline-none focus:border-[#2ca89c] focus:ring-3 focus:ring-[#2ca89c]/10";

export default function PortalHostManagement({ hosts, candidates, agencies }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [agencyFilter, setAgencyFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [editing, setEditing] = useState(null);
  const [promoting, setPromoting] = useState(false);
  const filteredHosts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return hosts.filter(
      (host) =>
        (!needle ||
          `${host.name} ${host.id} ${host.email ?? ""} ${host.phone ?? ""} ${host.country ?? ""}`
            .toLowerCase()
            .includes(needle)) &&
        (agencyFilter === "ALL" ||
          (agencyFilter === "UNASSIGNED"
            ? !host.agency
            : host.agency?.id === agencyFilter)) &&
        (statusFilter === "ALL" || host.status === statusFilter),
    );
  }, [hosts, query, agencyFilter, statusFilter]);
  const liveRooms = hosts.filter((host) => host.room?.status === "LIVE").length;
  const verifiedHosts = hosts.filter((host) => host.isVerified).length;
  const openPayouts = hosts.filter((host) => host.openWithdrawal).length;

  async function save(payload) {
    await managePortalHost(payload.id, payload.changes);
    setEditing(null);
    setPromoting(false);
    router.refresh();
  }

  return (
    <section aria-labelledby="portal-hosts-heading">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold tracking-[0.16em] text-[#16877d] uppercase">
            MegaLive operational hosts
          </p>
          <h3 id="portal-hosts-heading" className="mt-1 text-xl font-bold">
            Portal host directory
          </h3>
          <p className="mt-1 text-sm text-[#71847f]">
            These are the User accounts used by Android, audio rooms, gifts, and host payouts.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPromoting(true)}
          disabled={!candidates.length || !agencies.length}
          className="flex h-10 items-center justify-center gap-2 rounded-lg bg-[#087f74] px-4 text-xs font-bold text-white shadow-[0_8px_20px_rgba(8,127,116,.2)] transition hover:bg-[#076f66] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="text-lg leading-none">+</span>
          Promote portal user
        </button>
      </div>
      {!agencies.length && (
        <p className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          Create and activate an agency before assigning a portal user as a host.
        </p>
      )}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Portal hosts" value={hosts.length} note="Android host accounts" />
        <Metric label="Live audio rooms" value={liveRooms} note="Currently live" />
        <Metric label="KYC verified" value={verifiedHosts} note="Eligible for payout" />
        <Metric label="Open payouts" value={openPayouts} note="Pending or approved" />
      </div>
      <div className="overflow-hidden rounded-2xl border border-[#dce8e5] bg-white">
        <div className="flex flex-col gap-3 border-b border-[#e5ecea] p-5 xl:flex-row xl:items-center xl:justify-between">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-10 w-full max-w-sm rounded-lg border border-[#dce6e4] bg-[#fafcfc] px-4 text-xs outline-none focus:border-[#2ca89c] focus:ring-3 focus:ring-[#2ca89c]/10"
            placeholder="Search name, public ID, phone, country..."
            aria-label="Search portal hosts"
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            <select value={agencyFilter} onChange={(event) => setAgencyFilter(event.target.value)} className={inputClass} aria-label="Filter hosts by agency">
              <option value="ALL">All agencies</option>
              <option value="UNASSIGNED">Unassigned</option>
              {agencies.map((agency) => <option key={agency.id} value={agency.id}>{agency.name}</option>)}
            </select>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className={inputClass} aria-label="Filter hosts by status">
              <option value="ALL">All account statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="PENDING">Pending</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="BANNED">Banned</option>
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-left">
            <thead>
              <tr className="bg-[#f8fbfa] text-[10px] tracking-wider text-[#7b8e89] uppercase">
                <th className="px-5 py-3.5">Host</th><th>Agency</th><th>KYC / account</th><th>Audio room</th><th>Earnings</th><th>Gifts</th><th>Payout</th><th className="px-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf2f1]">
              {filteredHosts.map((host) => <HostRow key={host.id} host={host} onManage={() => setEditing(host)} />)}
            </tbody>
          </table>
          {!filteredHosts.length && <div className="py-16 text-center text-sm text-[#788b87]">No portal hosts match the selected filters.</div>}
        </div>
        <div className="border-t border-[#e8efed] px-5 py-4 text-[10px] text-[#849691]">Showing {filteredHosts.length} of {hosts.length} portal hosts</div>
      </div>
      {promoting && <HostModal mode="promote" candidates={candidates} agencies={agencies} onClose={() => setPromoting(false)} onSave={save} />}
      {editing && <HostModal mode="edit" host={editing} agencies={agencies} onClose={() => setEditing(null)} onSave={save} />}
    </section>
  );
}

function HostRow({ host, onManage }) {
  const room = host.room;
  return <tr className="text-xs hover:bg-[#f9fcfb]">
    <td className="px-5 py-4"><div className="flex items-center gap-3"><Avatar host={host} /><div><strong className="block">{host.name}</strong><span className="font-mono text-[10px] text-[#71847f]">{host.id}</span><span className="block text-[10px] text-[#71847f]">{host.country ?? host.phone ?? "Country not set"}</span></div></div></td>
    <td>{host.agency ? <><strong className="block">{host.agency.name}</strong><span className="font-mono text-[10px] text-[#71847f]">{host.agency.id}</span></> : <span className="text-amber-700">Unassigned</span>}</td>
    <td><Badge value={host.isVerified ? "VERIFIED" : "UNVERIFIED"} /><span className="mt-1 block"><Badge value={host.status} /></span></td>
    <td>{room ? <><strong className="block max-w-40 truncate">{room.title}</strong><span className={`text-[10px] font-bold ${room.status === "LIVE" ? "text-emerald-700" : "text-[#71847f]"}`}>{room.status} · {room.participantCount} listeners</span></> : <span className="text-[#71847f]">No room</span>}</td>
    <td><strong>{formatCoins(host.salaryCoins)}</strong><span className="block text-[10px] text-[#71847f]">salary coins</span></td>
    <td><strong>{formatCoins(host.giftCoins)}</strong><span className="block text-[10px] text-[#71847f]">{host.giftCount} gifts received</span></td>
    <td>{host.openWithdrawal ? <><Badge value={host.openWithdrawal.status} /><span className="mt-1 block text-[10px] text-[#71847f]">{formatCoins(host.openWithdrawal.coins)} coins</span></> : <span className="text-[#71847f]">None open</span>}</td>
    <td className="px-5 text-right"><div className="flex justify-end gap-2"><Link href={`/users/${encodeURIComponent(host.id)}`} className="rounded-lg border border-[#d7e4e1] px-3 py-2 text-[10px] font-bold text-[#526b67] hover:bg-[#f1f7f5]">Profile</Link><button type="button" onClick={onManage} className="rounded-lg bg-[#e1f3f0] px-3 py-2 text-[10px] font-bold text-[#087f74] hover:bg-[#cfece7]">Manage</button></div></td>
  </tr>;
}

function HostModal({ mode, host, candidates, agencies, onClose, onSave }) {
  const [selectedUserId, setSelectedUserId] = useState(host?.id ?? candidates?.[0]?.id ?? "");
  const [agencyId, setAgencyId] = useState(host?.agency?.id ?? agencies[0]?.id ?? "");
  const [status, setStatus] = useState(host?.status ?? "ACTIVE");
  const [isVerified, setIsVerified] = useState(host?.isVerified ?? false);
  const [hostEnabled, setHostEnabled] = useState(true);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const selectedUser = candidates?.find((candidate) => candidate.id === selectedUserId);
  const title = mode === "promote" ? "Promote portal user to host" : `Manage ${host.name}`;

  async function submit(event) {
    event.preventDefault();
    if (!reason.trim()) { setError("Enter a reason for this audited host change."); return; }
    if (hostEnabled && !agencyId) { setError("Select an active agency for this host."); return; }
    setPending(true); setError("");
    try {
      await onSave({ id: mode === "promote" ? selectedUserId : host.id, changes: { hostEnabled, agencyPublicId: hostEnabled ? agencyId : "", status, isVerified, auditReason: reason } });
    } catch (exception) {
      const message = String(exception?.message ?? "");
      setError(message.includes("HOST_AGENCY_REQUIRED") ? "Select an active agency for this host." : message.includes("HOST_REMOVAL_REQUIRES_ZERO_SALARY") ? "This host still has salary coins. Settle the balance in Finance before removing host access." : message.includes("HOST_REMOVAL_HAS_OPEN_WITHDRAWALS") ? "This host has an open withdrawal. Complete or reject it in Finance before removing host access." : "Unable to save the host changes. Please try again.");
    } finally { setPending(false); }
  }

  return <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[#061c1a]/60 p-4 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-labelledby="host-management-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="my-auto w-full max-w-xl rounded-2xl bg-white shadow-[0_24px_80px_rgba(0,0,0,.25)]">
      <div className="flex items-start justify-between border-b border-[#e5ecea] px-6 py-5"><div><p className="text-[10px] font-bold tracking-[0.16em] text-[#16877d] uppercase">Host access control</p><h2 id="host-management-title" className="mt-1 text-lg font-bold text-[#172f2b]">{title}</h2><p className="mt-1 text-xs text-[#748782]">Changes are logged and take effect for the MegaLive application.</p></div><button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-xl text-[#7c8f8a] hover:bg-[#f0f5f4]" aria-label="Close">×</button></div>
      <form onSubmit={submit} className="p-6">
        {mode === "promote" && <Field label="Portal user"><select value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)} className={inputClass} required>{candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.id} · {candidate.country ?? candidate.phone}</option>)}</select>{selectedUser && <p className="mt-1 text-[10px] text-[#71847f]">{selectedUser.phone} · {selectedUser.country ?? "Country not set"}</p>}</Field>}
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Portal host access"><label className="mt-1 flex h-10 items-center gap-2 rounded-lg border border-[#dce6e4] px-3 text-xs"><input type="checkbox" checked={hostEnabled} onChange={(event) => setHostEnabled(event.target.checked)} /> Active host</label></Field>
          <Field label="Account status"><select value={status} onChange={(event) => setStatus(event.target.value)} className={inputClass}><option value="ACTIVE">Active</option><option value="PENDING">Pending</option><option value="SUSPENDED">Suspended</option><option value="BANNED">Banned</option></select></Field>
          <Field label="Agency"><select value={agencyId} onChange={(event) => setAgencyId(event.target.value)} disabled={!hostEnabled} className={inputClass} required={hostEnabled}><option value="">Select active agency</option>{agencies.map((agency) => <option key={agency.id} value={agency.id}>{agency.name} · {agency.id}</option>)}</select></Field>
          <Field label="KYC verification"><label className="mt-1 flex h-10 items-center gap-2 rounded-lg border border-[#dce6e4] px-3 text-xs"><input type="checkbox" checked={isVerified} disabled={!hostEnabled} onChange={(event) => setIsVerified(event.target.checked)} /> Verified for payout</label></Field>
        </div>
        <Field label="Audit reason"><textarea value={reason} onChange={(event) => setReason(event.target.value)} required maxLength="1000" className="mt-1 min-h-24 w-full rounded-lg border border-[#dce6e4] bg-white px-3 py-2.5 text-xs outline-none focus:border-[#2ca89c] focus:ring-3 focus:ring-[#2ca89c]/10" placeholder="Why is this host role or account state being changed?" /></Field>
        {hostEnabled && isVerified && status === "ACTIVE" && (mode === "promote" ? selectedUserId.startsWith("USR-") : host.id.startsWith("USR-")) && <p className="mt-5 rounded-lg border border-[#bce9e2] bg-[#f1fbf9] px-3 py-2.5 text-xs text-[#27635c]">On approval, this account keeps its number and changes from <strong>USR</strong> to <strong>TLN</strong>. The existing mobile session is invalidated so the user signs in again with the new ID.</p>}
        {!hostEnabled && <p className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">Removing host access keeps the user account, but requires no salary balance and no open withdrawal.</p>}
        {error && <p className="mt-5 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700" role="alert">{error}</p>}
        <div className="mt-6 flex justify-end gap-2 border-t border-[#e8efed] pt-5"><button type="button" onClick={onClose} className="h-10 rounded-lg border border-[#d7e3e0] px-4 text-xs font-bold text-[#5d716c] hover:bg-[#f5f8f7]">Cancel</button><button type="submit" disabled={pending || (mode === "promote" && !selectedUserId)} className="h-10 rounded-lg bg-[#087f74] px-5 text-xs font-bold text-white hover:bg-[#076f66] disabled:cursor-wait disabled:opacity-60">{pending ? "Saving..." : mode === "promote" ? "Promote host" : "Save changes"}</button></div>
      </form>
    </div>
  </div>;
}

function Field({ label, children }) { return <div className="block"><span className="mb-2 block text-xs font-bold text-[#29423d]">{label}</span>{children}</div>; }
function Metric({ label, value, note }) { return <div className="rounded-xl border border-[#dfe9e7] bg-white p-5"><p className="text-[11px] font-semibold text-[#768984]">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p><p className="mt-2 text-[10px] text-[#429387]">{note}</p></div>; }
function Avatar({ host }) { const initials = host.name.split(" ").filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase(); return host.profileImage ? <img src={host.profileImage} alt="" className="h-9 w-9 rounded-full object-cover" /> : <span className="grid h-9 w-9 place-items-center rounded-full bg-[#dff5f1] font-bold text-[#087f74]">{initials || "H"}</span>; }
function Badge({ value }) { const normalized = String(value).toUpperCase(); const palette = normalized === "ACTIVE" || normalized === "VERIFIED" || normalized === "LIVE" || normalized === "COMPLETED" ? "bg-emerald-50 text-emerald-700" : normalized === "BANNED" || normalized === "SUSPENDED" || normalized === "REJECTED" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"; return <span className={`inline-flex rounded-full px-2 py-1 text-[9px] font-bold ${palette}`}>{normalized.replaceAll("_", " ")}</span>; }
function formatCoins(value) { try { return BigInt(value ?? 0).toLocaleString(); } catch { return "0"; } }
