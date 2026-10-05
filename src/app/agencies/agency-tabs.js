"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import RecordTable from "../components/record-table";
import SalaryPanel from "./salary-panel";

const tabs = [
  "Agency Home",
  "Agency Tasks",
  "Monthly Salary",
  "Host Salaries",
  "Agency Apply",
  "Join Requests",
];
export default function AgencyTabs({ applications = [], joinRequests = [], overview, modules }) {
  const searchParams = useSearchParams();
  const requested = searchParams.get("tab");
  const [active, setActive] = useState(
    tabs.includes(requested) ? requested : tabs[0],
  );
  return (
    <>
      <div
        className="mb-7 overflow-x-auto border-b border-[#dce7e4]"
        role="tablist"
        aria-label="Agency management sections"
      >
        <div className="flex min-w-max gap-1">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
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
        {active === "Agency Home" ? (
          <AgencyHome overview={overview} />
        ) : (
          <Module tab={active} applications={applications} joinRequests={joinRequests} modules={modules} />
        )}
      </section>
    </>
  );
}

function AgencyHome({ overview }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Total agencies", overview.totalAgencies, `${overview.activeAgencies} currently active`],
          ["Agency hosts", overview.totalHosts, "Across all agencies"],
          ["Total Recharge", overview.totalRecharge, "Recorded host recharge coins"],
          ["Monthly gifts", overview.monthlyGifts, "Current UTC calendar month"],
          [
            "Pending applications",
            overview.pendingApplications + overview.pendingJoinRequests,
            "Applications and join requests",
          ],
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
      <div className="grid gap-6 xl:grid-cols-2">
        <AgencyTable agencies={overview.rankings} />
        <TalentTable hosts={overview.topHosts} />
      </div>
    </div>
  );
}

function AgencyTable({ agencies }) {
  return (
    <Card
      title="Agency ranking"
      description="Ranked by current-month gift performance"
    >
      <table className="w-full min-w-[620px] text-left text-xs">
        <thead>
          <tr className="bg-[#f8fbfa] text-[10px] tracking-wider text-[#7b8e89] uppercase">
            <th className="px-5 py-3.5">Rank</th>
            <th>Agency</th>
            <th>Hosts</th>
            <th>Gifts</th>
            <th>Target</th>
            <th className="pr-5">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#edf2f1]">
          {agencies.map((item) => (
            <tr key={item.id} className="hover:bg-[#f9fcfb]">
              <td className="px-5 py-4 font-bold text-[#087f74]">
                #{item.rank}
              </td>
              <td>
                <strong className="block">{item.name}</strong>
                <span className="text-[9px] text-[#849691]">{item.id}</span>
              </td>
              <td>{item.hosts}</td>
              <td className="font-semibold">{BigInt(item.gifts).toLocaleString()}</td>
              <td>{BigInt(item.target).toLocaleString()} · {item.progress.toFixed(1)}%</td>
              <td className="pr-5">
                <Status value={item.target === "0" ? "Not set" : item.progress >= 100 ? "Achieved" : "In progress"} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!agencies.length && <p className="p-10 text-center text-xs text-[#81938e]">No agencies have been created.</p>}
    </Card>
  );
}

function TalentTable({ hosts }) {
  return (
    <Card
      title="Top hosts"
      description="Performance and agency target contribution"
    >
      <table className="w-full min-w-[580px] text-left text-xs">
        <thead>
          <tr className="bg-[#f8fbfa] text-[10px] tracking-wider text-[#7b8e89] uppercase">
            <th className="px-5 py-3.5">Rank</th>
            <th>Host</th>
            <th>Agency</th>
            <th>Gifts</th>
            <th className="pr-5">Type</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#edf2f1]">
          {hosts.map((item) => (
            <tr key={item.id} className="hover:bg-[#f9fcfb]">
              <td className="px-5 py-4 font-bold text-[#087f74]">
                #{item.rank}
              </td>
              <td>
                <strong className="block">{item.name}</strong>
                <span className="text-[9px] text-[#849691]">{item.id}</span>
              </td>
              <td>{item.agency}</td>
              <td className="font-semibold">{BigInt(item.gifts).toLocaleString()}</td>
              <td className="pr-5">{item.kind}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!hosts.length && <p className="p-10 text-center text-xs text-[#81938e]">No agency hosts are available.</p>}
    </Card>
  );
}

function Module({ tab, applications, joinRequests, modules }) {
  if (tab === "Agency Apply")
    return <AgencyApplications applications={applications} />;
  if (tab === "Join Requests")
    return <AgencyJoinRequests initialRequests={joinRequests} />;
  if (tab === "Agency Tasks")
    return <RecordTable title="Agency Targets" description="Live progress against owner-configured monthly targets." rows={modules.tasks} columns={[{key:"agencyId",label:"Agency ID",mono:true},{key:"agency",label:"Agency"},{key:"target",label:"Target coins"},{key:"achieved",label:"Gift coins"},{key:"progress",label:"Progress"},{key:"status",label:"Status",badge:true}]}/>;
  if (tab === "Monthly Salary")
    return <SalaryPanel agencies={modules.monthlySalaries}/>;
  if (tab === "Host Salaries")
    return <RecordTable title="Host Salaries" description="Current salary balances for every database-linked agency host." rows={modules.hostSalaries} columns={[{key:"hostId",label:"Host ID",mono:true},{key:"host",label:"Host"},{key:"agency",label:"Agency"},{key:"type",label:"Host type"},{key:"salaryBalance",label:"Salary balance"}]}/>;
  return null;
}

function AgencyJoinRequests({ initialRequests }) {
  const [requests, setRequests] = useState(initialRequests);
  const [selected, setSelected] = useState(null);
  const [decision, setDecision] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function review(event) {
    event.preventDefault();
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/agencies/join-requests/${selected.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, note }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "Review failed.");
      setRequests((current) => current.map((item) => item.id === selected.id ? { ...item, ...result.data } : item));
      setSelected(null); setDecision(""); setNote("");
    } catch (reviewError) { setError(reviewError.message); } finally { setSaving(false); }
  }
  return (
    <div className="rounded-2xl border border-[#dce8e5] bg-white">
      <div className="border-b px-5 py-4"><h3 className="font-bold">Agency join requests</h3><p className="mt-1 text-xs text-[#71847f]">Approve a request to link the user and grant the Host role.</p></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-xs"><thead className="bg-[#f8fbfa] text-[10px] uppercase text-[#7b8e89]"><tr><th className="px-5 py-3">Applicant</th><th>Agency</th><th>Requested</th><th>Status</th><th className="pr-5 text-right">Action</th></tr></thead><tbody className="divide-y divide-[#edf2f1]">{requests.map((item)=><tr key={item.id}><td className="px-5 py-4"><Link href={`/users/${encodeURIComponent(item.applicant.id)}`} target="_blank" className="font-bold text-[#087f74]">{item.applicant.name}</Link><p className="mt-1 font-mono text-[9px]">{item.applicant.id} · {item.applicant.phone}</p></td><td><strong>{item.agency.name}</strong><p className="mt-1 font-mono text-[9px]">{item.agency.id}</p></td><td>{formatDate(item.submittedAt)}</td><td><ApplicationStatus value={item.status}/></td><td className="pr-5 text-right"><button type="button" onClick={()=>{setSelected(item);setDecision("");setNote("");setError("");}} className="rounded-lg border border-[#bddbd6] px-3 py-2 font-bold text-[#087f74]">{item.status === "PENDING" ? "Review" : "View"}</button></td></tr>)}</tbody></table>{!requests.length&&<p className="py-12 text-center text-xs text-[#81938e]">No agency join requests yet.</p>}</div>
      {selected&&<div className="fixed inset-0 z-50 grid place-items-center bg-[#071f1d]/60 p-4"><form onSubmit={review} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"><h3 className="text-lg font-bold">{selected.applicant.name}</h3><p className="mt-1 text-xs text-[#71847f]">Request to join {selected.agency.name}</p>{selected.status === "PENDING"?<><div className="mt-5 grid grid-cols-2 gap-2"><button type="button" onClick={()=>setDecision("APPROVED")} className={`rounded-lg border p-3 text-xs font-bold ${decision==="APPROVED"?"border-emerald-600 bg-emerald-50 text-emerald-700":""}`}>Approve</button><button type="button" onClick={()=>setDecision("REJECTED")} className={`rounded-lg border p-3 text-xs font-bold ${decision==="REJECTED"?"border-rose-600 bg-rose-50 text-rose-700":""}`}>Reject</button></div><textarea value={note} onChange={(event)=>setNote(event.target.value)} required={decision==="REJECTED"} placeholder={decision==="REJECTED"?"Rejection reason (required)":"Optional review note"} rows={3} className="mt-4 w-full rounded-lg border border-[#dce8e5] p-3 text-xs"/>{error&&<p className="mt-3 text-xs font-semibold text-rose-600">{error}</p>}<div className="mt-5 flex justify-end gap-2"><button type="button" onClick={()=>setSelected(null)} className="rounded-lg border px-4 py-2 text-xs font-bold">Cancel</button><button disabled={!decision||saving} className="rounded-lg bg-[#087f74] px-5 py-2 text-xs font-bold text-white disabled:opacity-40">{saving?"Saving…":"Confirm"}</button></div></>:<><p className="mt-5 rounded-lg bg-[#f7faf9] p-3 text-xs">{selected.reviewNote||"No review note."}</p><button type="button" onClick={()=>setSelected(null)} className="mt-5 w-full rounded-lg border px-4 py-2 text-xs font-bold">Close</button></>}</form></div>}
    </div>
  );
}

function AgencyApplications({ applications }) {
  const [records, setRecords] = useState(applications);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [selected, setSelected] = useState(null);
  const normalized = query.trim().toLowerCase();
  const filtered = records.filter((application) => {
    const matchesStatus = status === "ALL" || application.status === status;
    const haystack =
      `${application.id} ${application.agencyName} ${application.email ?? ""} ${application.whatsapp} ${application.bdCode} ${application.country ?? ""} ${application.applicant.id} ${application.applicant.name} ${application.applicant.phone}`.toLowerCase();
    return matchesStatus && (!normalized || haystack.includes(normalized));
  });
  const pending = records.filter(
    (application) => application.status === "PENDING",
  ).length;
  function reviewed(result) {
    const updates = {
      status: result.status,
      reviewedAt: result.reviewedAt,
      reviewNote: result.reviewNote,
      rejectionReason: result.rejectionReason,
      reviewedBy: result.reviewedBy,
      updatedAt: result.reviewedAt,
    };
    setRecords((current) =>
      current.map((application) =>
        application.id === result.applicationId
          ? { ...application, ...updates }
          : application,
      ),
    );
    setSelected(null);
  }
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Total applications", records.length],
          ["Pending review", pending],
          ["Processed", records.length - pending],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-xl border border-[#dce8e5] bg-white p-5"
          >
            <p className="text-[10px] font-bold tracking-wide text-[#7c8f8a] uppercase">
              {label}
            </p>
            <p className="mt-2 text-2xl font-bold text-[#173b37]">
              {value.toLocaleString()}
            </p>
          </div>
        ))}
      </div>
      <section className="overflow-hidden rounded-2xl border border-[#dce8e5] bg-white">
        <div className="flex flex-col gap-3 border-b border-[#e5ecea] p-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="text-base font-bold">Agency applications</h3>
            <p className="mt-1 text-[10px] text-[#7d908b]">
              Applications submitted through the authenticated mobile
              application.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search agency, applicant, ID, phone…"
              className="h-10 min-w-72 rounded-lg border border-[#d7e4e1] px-3 text-xs outline-none focus:border-[#2ca89c]"
            />
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="h-10 rounded-lg border border-[#d7e4e1] bg-white px-3 text-xs outline-none focus:border-[#2ca89c]"
            >
              <option value="ALL">All statuses</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>
        </div>
        {filtered.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1300px] text-left text-xs">
              <thead>
                <tr className="bg-[#f8fbfa] text-[9px] tracking-wider text-[#748782] uppercase">
                  <th className="px-5 py-3.5">Application</th>
                  <th>Applicant</th>
                  <th>Contact</th>
                  <th>Country</th>
                  <th>BD code</th>
                  <th>CNIC front</th>
                  <th>CNIC back</th>
                  <th>Status</th>
                  <th>Submitted</th>
                  <th className="pr-5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf2f1]">
                {filtered.map((application) => (
                  <tr key={application.id} className="hover:bg-[#f9fcfb]">
                    <td className="px-5 py-4">
                      <button
                        type="button"
                        onClick={() => setSelected(application)}
                        className="text-left font-bold text-[#173b37] hover:text-[#087f74] hover:underline"
                      >
                        {application.agencyName}
                      </button>
                      <p className="mt-1 font-mono text-[9px] text-[#7f928d]">
                        {application.id}
                      </p>
                    </td>
                    <td>
                      <Link
                        href={`/users/${encodeURIComponent(application.applicant.id)}`}
                        target="_blank"
                        className="font-bold text-[#087f74] hover:underline"
                      >
                        {application.applicant.name}
                      </Link>
                      <p className="mt-1 font-mono text-[9px] text-[#7f928d]">
                        {application.applicant.id}
                      </p>
                    </td>
                    <td>
                      <p>{application.whatsapp}</p>
                      <p className="mt-1 text-[9px] text-[#7f928d]">
                        {application.email || "No email"}
                      </p>
                      <p className="mt-1 text-[9px] text-[#7f928d]">
                        {application.applicant.phone}
                      </p>
                    </td>
                    <td>{application.country || "—"}</td>
                    <td className="font-mono font-bold">
                      {application.bdCode}
                    </td>
                    <td>
                      <CnicPreview
                        url={application.cnicFrontUrl}
                        label={`${application.agencyName} CNIC front`}
                      />
                    </td>
                    <td>
                      <CnicPreview
                        url={application.cnicBackUrl}
                        label={`${application.agencyName} CNIC back`}
                      />
                    </td>
                    <td>
                      <ApplicationStatus value={application.status} />
                    </td>
                    <td>
                      <p>{formatDate(application.submittedAt)}</p>
                      <p className="mt-1 text-[9px] text-[#7f928d]">
                        {relativeTime(application.submittedAt)}
                      </p>
                    </td>
                    <td className="pr-5 text-right">
                      <button
                        type="button"
                        onClick={() => setSelected(application)}
                        className="rounded-lg bg-[#e6f5f2] px-3 py-2 text-[9px] font-bold text-[#087f74] hover:bg-[#d4ece8]"
                      >
                        {application.status === "PENDING" ? "Review" : "View"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-6 py-16 text-center">
            <p className="text-sm font-bold text-[#526b67]">
              {records.length
                ? "No applications match the current filters."
                : "No agency applications submitted yet."}
            </p>
            <p className="mt-1 text-[10px] text-[#879792]">
              New mobile submissions will appear here automatically.
            </p>
          </div>
        )}
      </section>
      {selected && (
        <ApplicationReviewModal
          application={selected}
          onClose={() => setSelected(null)}
          onReviewed={reviewed}
        />
      )}
    </div>
  );
}

function ApplicationReviewModal({ application, onClose, onReviewed }) {
  const [decision, setDecision] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault();
    const note = String(new FormData(event.currentTarget).get("note") ?? "");
    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        `/api/agencies/applications/${application.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision, note }),
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error?.message || "Review failed.");
      onReviewed(result.data);
    } catch (reviewError) {
      setError(reviewError.message);
    } finally {
      setSaving(false);
    }
  }
  const decided = application.status !== "PENDING";
  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-[#071f1d]/65 p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="application-review-title"
    >
      <div className="mx-auto my-3 w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-[#e3ebe9] px-6 py-5">
          <div>
            <p className="text-[10px] font-bold tracking-widest text-[#16877d] uppercase">
              Agency application
            </p>
            <h2
              id="application-review-title"
              className="mt-1 text-xl font-bold"
            >
              {application.agencyName}
            </h2>
            <p className="mt-1 font-mono text-[10px] text-[#7d908b]">
              {application.id}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg p-2 text-xl text-[#70827e] hover:bg-[#f0f5f4]"
            aria-label="Close application"
          >
            ×
          </button>
        </div>
        <div className="grid gap-6 p-6 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <h3 className="text-sm font-bold">Application details</h3>
            <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-4 rounded-xl border border-[#dce8e5] bg-[#f9fcfb] p-5">
              <Detail label="Applicant" value={application.applicant.name} />
              <Detail label="User ID" value={application.applicant.id} mono />
              <Detail
                label="Account phone"
                value={application.applicant.phone}
              />
              <Detail label="WhatsApp" value={application.whatsapp} />
              <Detail label="Email" value={application.email || "No email"} />
              <Detail label="Country" value={application.country || "—"} />
              <Detail label="BD code" value={application.bdCode} mono />
              <Detail
                label="Submitted"
                value={formatDate(application.submittedAt)}
              />
            </dl>
            <div className="mt-5 rounded-xl border border-[#dce8e5] p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold">Review status</h3>
                <ApplicationStatus value={application.status} />
              </div>
              {application.reviewedAt && (
                <div className="mt-4 space-y-2 text-xs">
                  <p>
                    <span className="text-[#7b8e89]">Reviewed:</span>{" "}
                    {formatDate(application.reviewedAt)}
                  </p>
                  <p>
                    <span className="text-[#7b8e89]">By:</span>{" "}
                    {application.reviewedBy?.name || "Administrator"}
                  </p>
                  {(application.rejectionReason || application.reviewNote) && (
                    <p className="rounded-lg bg-[#f7faf9] p-3 leading-5">
                      <span className="font-bold">
                        {application.status === "REJECTED" ? "Reason" : "Note"}:
                      </span>{" "}
                      {application.rejectionReason || application.reviewNote}
                    </p>
                  )}
                </div>
              )}
            </div>
            <Link
              href={`/users/${encodeURIComponent(application.applicant.id)}`}
              target="_blank"
              className="mt-4 inline-flex rounded-lg border border-[#bddbd6] px-4 py-2.5 text-xs font-bold text-[#087f74] hover:bg-[#eef8f6]"
            >
              Open user profile ↗
            </Link>
          </div>
          <div>
            <h3 className="text-sm font-bold">Identity documents</h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <DocumentPreview
                url={application.cnicFrontUrl}
                label="CNIC front"
              />
              <DocumentPreview
                url={application.cnicBackUrl}
                label="CNIC back"
              />
            </div>
            <p className="mt-3 text-[9px] leading-4 text-[#80918d]">
              When identity documents are supplied, they can be inspected in a
              new tab and remain protected by administrator authentication.
            </p>
          </div>
        </div>
        {!decided && (
          <form
            onSubmit={submit}
            className="border-t border-[#e3ebe9] bg-[#fafcfc] px-6 py-5"
          >
            {decision && (
              <div className="mb-4">
                <label className="mb-2 block text-xs font-bold">
                  {decision === "REJECTED"
                    ? "Rejection reason"
                    : "Approval note (optional)"}
                </label>
                <textarea
                  name="note"
                  required={decision === "REJECTED"}
                  maxLength={1000}
                  rows={3}
                  className="w-full resize-none rounded-lg border border-[#d5e2df] bg-white p-3 text-xs outline-none focus:border-[#2ca89c]"
                  placeholder={
                    decision === "REJECTED"
                      ? "Explain why this application is being rejected…"
                      : "Add an optional internal note…"
                  }
                />
                {error && (
                  <p className="mt-3 rounded-lg bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">
                    {error}
                  </p>
                )}
              </div>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={
                  decision
                    ? () => {
                        setDecision(null);
                        setError("");
                      }
                    : onClose
                }
                disabled={saving}
                className="rounded-lg border border-[#d4e0de] px-4 py-2.5 text-xs font-bold"
              >
                {decision ? "Back" : "Close"}
              </button>
              {decision ? (
                <button
                  type="submit"
                  disabled={saving}
                  className={`rounded-lg px-5 py-2.5 text-xs font-bold text-white disabled:opacity-50 ${decision === "APPROVED" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"}`}
                >
                  {saving ? "Saving…" : `Confirm ${display(decision)}`}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setDecision("REJECTED")}
                    className="rounded-lg bg-rose-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-rose-700"
                  >
                    Reject application
                  </button>
                  <button
                    type="button"
                    onClick={() => setDecision("APPROVED")}
                    className="rounded-lg bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-emerald-700"
                  >
                    Approve application
                  </button>
                </>
              )}
            </div>
          </form>
        )}
        {decided && (
          <div className="flex justify-end border-t border-[#e3ebe9] bg-[#fafcfc] px-6 py-5">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[#d4e0de] px-5 py-2.5 text-xs font-bold"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Detail({ label, value, mono }) {
  return (
    <div>
      <dt className="text-[9px] font-bold tracking-wide text-[#82938f] uppercase">
        {label}
      </dt>
      <dd
        className={`mt-1 break-words text-xs font-semibold ${mono ? "font-mono" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}
function DocumentPreview({ url, label }) {
  if (!url)
    return (
      <div className="grid aspect-[1.58/1] place-items-center rounded-xl border border-dashed border-[#d6e4e1] bg-[#f7faf9] px-4 text-center text-[10px] font-semibold text-[#82938f]">
        Not provided by this application flow
      </div>
    );
  return (
    <a href={url} target="_blank" rel="noreferrer" className="group block">
      <div className="relative aspect-[1.58/1] overflow-hidden rounded-xl border border-[#d6e4e1] bg-[#edf4f2]">
        <Image
          src={url}
          alt={label}
          fill
          unoptimized
          className="object-contain transition group-hover:scale-[1.02]"
        />
      </div>
      <p className="mt-2 text-center text-[10px] font-bold text-[#087f74]">
        {label} · Open original ↗
      </p>
    </a>
  );
}

function CnicPreview({ url, label }) {
  if (!url)
    return <span className="text-[9px] font-semibold text-[#82938f]">Not provided</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="group relative block h-14 w-20 overflow-hidden rounded-lg border border-[#d6e4e1] bg-[#edf4f2]"
    >
      <Image
        src={url}
        alt={label}
        fill
        unoptimized
        className="object-cover transition group-hover:scale-105"
      />
      <span className="absolute inset-x-0 bottom-0 bg-black/55 py-0.5 text-center text-[7px] font-bold text-white">
        Open
      </span>
    </a>
  );
}

function ApplicationStatus({ value }) {
  const styles = {
    PENDING: "bg-amber-50 text-amber-700",
    APPROVED: "bg-emerald-50 text-emerald-700",
    REJECTED: "bg-rose-50 text-rose-700",
  };
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[9px] font-bold ${styles[value] ?? "bg-slate-100 text-slate-600"}`}
    >
      {display(value)}
    </span>
  );
}

function formatDate(value) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
function relativeTime(value) {
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 60000),
  );
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
function display(value) {
  return String(value)
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function Card({ title, description, children }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#dce8e5] bg-white">
      <div className="border-b border-[#e6eeec] px-5 py-4">
        <h3 className="text-sm font-bold">{title}</h3>
        <p className="mt-0.5 text-[10px] text-[#849590]">{description}</p>
      </div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}
function Status({ value }) {
  return (
    <span
      className={`rounded-full px-2 py-1 text-[9px] font-bold ${value === "At risk" ? "bg-rose-50 text-rose-700" : value === "Achieved" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}
    >
      {value}
    </span>
  );
}
