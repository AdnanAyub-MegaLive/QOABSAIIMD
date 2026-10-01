"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const tabs = ["Payout review", "Reconciliation", "Top-ups", "Gift settlements", "Immutable ledger", "Mobile integration"];

export default function FinanceConsole({ stats, withdrawals, reconciliations, topUps, gifts, packages, ledger, integration }) {
  const [activeTab, setActiveTab] = useState(tabs[0]);
  const [selectedWithdrawal, setSelectedWithdrawal] = useState(null);
  const [onlyAlerts, setOnlyAlerts] = useState(true);
  return (
    <>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Payouts to review" value={stats.pendingWithdrawals} note="Pending or approved" tone="amber" />
        <Metric label="Top-ups today" value={stats.completedTopUpsToday} note={`PKR ${stats.topUpAmountToday}`} tone="emerald" />
        <Metric label="Gifts today" value={formatNumber(stats.giftsToday)} note="Gross coin value" tone="violet" />
        <Metric label="Reconciliation alerts" value={stats.reconciliationAlerts} note="Baseline or investigation" tone={stats.reconciliationAlerts ? "red" : "emerald"} />
        <Metric label="Active packages" value={packages.filter((item) => item.active).length} note={`${packages.length} configured`} tone="slate" />
      </section>

      <div className="mt-7 overflow-x-auto border-b border-[#dce7e4]" role="tablist" aria-label="Finance sections">
        <div className="flex min-w-max gap-1">
          {tabs.map((tab) => <button key={tab} type="button" onClick={() => setActiveTab(tab)} role="tab" aria-selected={activeTab === tab} className={`relative px-4 py-3 text-xs font-semibold transition ${activeTab === tab ? "text-[#087f74] after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-[#087f74]" : "text-[#71847f] hover:text-[#294a45]"}`}>{tab}</button>)}
        </div>
      </div>

      <section className="mt-6" role="tabpanel">
        {activeTab === "Payout review" && <WithdrawalsTable withdrawals={withdrawals} onAction={setSelectedWithdrawal} />}
        {activeTab === "Reconciliation" && <ReconciliationTable rows={reconciliations} onlyAlerts={onlyAlerts} setOnlyAlerts={setOnlyAlerts} />}
        {activeTab === "Top-ups" && <TopUpsTable rows={topUps} packages={packages} />}
        {activeTab === "Gift settlements" && <GiftSettlementsTable rows={gifts} />}
        {activeTab === "Immutable ledger" && <LedgerTable rows={ledger} />}
        {activeTab === "Mobile integration" && <MobileIntegration integration={integration} />}
      </section>
      {selectedWithdrawal && <WithdrawalActionModal selection={selectedWithdrawal} onClose={() => setSelectedWithdrawal(null)} />}
    </>
  );
}

function Metric({ label, value, note, tone }) {
  const tones = { emerald: "bg-emerald-50 text-emerald-700", amber: "bg-amber-50 text-amber-700", violet: "bg-violet-50 text-violet-700", red: "bg-red-50 text-red-700", slate: "bg-slate-100 text-slate-700" };
  return <div className="rounded-xl border border-[#dfe9e7] bg-white p-5"><div className="flex items-start justify-between gap-2"><p className="text-[11px] font-semibold text-[#768984]">{label}</p><span className={`rounded-full px-2 py-1 text-[9px] font-bold ${tones[tone]}`}>{tone === "red" ? "Review" : "Live"}</span></div><p className="mt-3 text-2xl font-bold">{value}</p><p className="mt-2 text-[10px] text-[#429387]">{note}</p></div>;
}

function WithdrawalsTable({ withdrawals, onAction }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("OPEN");
  const rows = useMemo(() => withdrawals.filter((item) => {
    const matchesQuery = `${item.id} ${item.host} ${item.hostId} ${item.method}`.toLowerCase().includes(query.trim().toLowerCase());
    const matchesStatus = status === "ALL" || status === "OPEN" ? (status === "ALL" || ["PENDING", "APPROVED"].includes(item.status)) : item.status === status;
    return matchesQuery && matchesStatus;
  }), [withdrawals, query, status]);
  return <Panel title="Withdrawal requests" description="A payout remains reserved until it is rejected or confirmed paid. Every review is written to the audit log." action={<div className="flex gap-2"><select value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 rounded-lg border border-[#dce6e4] bg-white px-3 text-xs"><option value="OPEN">Open only</option><option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="COMPLETED">Paid</option><option value="REJECTED">Rejected</option><option value="ALL">All states</option></select><input value={query} onChange={(event) => setQuery(event.target.value)} className="h-10 w-56 rounded-lg border border-[#dce6e4] bg-[#fafcfc] px-3 text-xs outline-none focus:border-[#2ca89c]" placeholder="Search host or withdrawal ID..." /></div>}>
    <Table headers={["Withdrawal", "Host", "Method / account", "Requested", "State", "Review", "Actions"]}>
      {rows.map((item) => <tr key={item.id} className="hover:bg-[#f9fcfb]"><td className="px-5 py-4"><code className="text-[10px] font-bold text-[#087f74]">{item.id}</code><p className="mt-1 text-[10px] text-[#81928e]">{formatDate(item.createdAt)}</p></td><td><p className="font-semibold">{item.host}</p><p className="text-[9px] text-[#849590]">{item.hostId} · {item.hostVerified ? "KYC verified" : "KYC pending"}</p></td><td><p className="capitalize">{item.method.replaceAll("_", " ")}</p><p className="text-[10px] text-[#71847f]">{item.accountName} · ••••{item.accountNumber.slice(-4)}</p><details className="mt-1 text-[9px] text-[#087f74]"><summary className="cursor-pointer">Show payout details</summary><p className="mt-1 font-mono text-[#526b67]">{item.accountNumber}</p></details></td><td><p className="font-bold">{formatNumber(item.coins)} diamonds</p><p className="text-[10px] text-[#71847f]">{item.currency} {item.amount}</p></td><td><Status value={item.status} /></td><td className="max-w-44"><p className="line-clamp-2 text-[10px] text-[#526b67]">{item.rejectionReason ?? item.reviewNote ?? "Not reviewed"}</p><p className="mt-1 text-[9px] text-[#849590]">{item.reviewer ?? "—"}{item.payoutReference ? ` · ${item.payoutReference}` : ""}</p></td><td className="px-5"><div className="flex flex-wrap justify-end gap-1.5">{item.status === "PENDING" && <ActionButton label="Approve" tone="emerald" onClick={() => onAction({ item, action: "APPROVE" })} />}{["PENDING", "APPROVED"].includes(item.status) && <ActionButton label="Reject" tone="red" onClick={() => onAction({ item, action: "REJECT" })} />}{item.status === "APPROVED" && <ActionButton label="Mark paid" tone="violet" onClick={() => onAction({ item, action: "MARK_PAID" })} />}</div></td></tr>)}
    </Table>
    {!rows.length && <Empty text="No withdrawal requests match the current filters." />}
  </Panel>;
}

function ReconciliationTable({ rows, onlyAlerts, setOnlyAlerts }) {
  const visible = onlyAlerts ? rows.filter((item) => item.status !== "MATCHED") : rows;
  return <Panel title="Wallet reconciliation" description="Balances are compared with signed, immutable ledger entries. Historical accounts without a verified opening balance are flagged for investigation." action={<label className="flex items-center gap-2 text-xs font-semibold text-[#526b67]"><input type="checkbox" checked={onlyAlerts} onChange={(event) => setOnlyAlerts(event.target.checked)} /> Show alerts only</label>}>
    <Table headers={["User", "Coin balance", "Ledger coins", "Salary balance", "Ledger salary", "Difference", "Result"]}>{visible.map((item) => <tr key={item.userId} className="hover:bg-[#f9fcfb]"><td className="px-5 py-4"><p className="font-semibold">{item.name}</p><code className="text-[9px] text-[#087f74]">{item.userId}</code></td><td>{formatNumber(item.balanceCoins)}</td><td>{formatNumber(item.ledgerCoins)}</td><td>{formatNumber(item.balanceSalaryCoins)}</td><td>{formatNumber(item.ledgerSalaryCoins)}</td><td><p className={item.coinsDifference === "0" && item.salaryDifference === "0" ? "text-[#087f74]" : "font-bold text-red-600"}>C {formatSigned(item.coinsDifference)} · D {formatSigned(item.salaryDifference)}</p></td><td><Status value={item.status} /></td></tr>)}</Table>
    {!visible.length && <Empty text="All checked accounts reconcile with their ledger entries." />}
  </Panel>;
}

function TopUpsTable({ rows, packages }) {
  return <Panel title="Top-up orders" description="Amounts and package credits are server-owned. A provider webhook can resolve an order only once with a trusted reference." action={<span className="text-[10px] text-[#71847f]">{packages.filter((item) => item.active).length} active coin packages</span>}>
    <Table headers={["Order", "User", "Package", "Payment", "Amount", "Credits", "State"]}>{rows.map((item) => <tr key={item.id} className="hover:bg-[#f9fcfb]"><td className="px-5 py-4"><code className="text-[10px] font-bold text-[#087f74]">{item.id}</code><p className="mt-1 text-[9px] text-[#849590]">{formatDate(item.createdAt)}</p></td><td><p className="font-semibold">{item.user}</p><code className="text-[9px] text-[#849590]">{item.userId}</code></td><td><code className="text-[10px]">{item.packageId}</code></td><td className="capitalize">{item.paymentMethod.replaceAll("_", " ")}{item.providerReference && <p className="mt-1 max-w-32 truncate text-[9px] text-[#849590]">{item.providerReference}</p>}</td><td>{item.currency} {item.amount}</td><td><p className="font-bold">{formatNumber(item.totalCoins)} coins</p><p className="text-[9px] text-[#849590]">{formatNumber(item.baseCoins)} + {formatNumber(item.bonusCoins)} bonus</p></td><td><Status value={item.status} /></td></tr>)}</Table>
    {!rows.length && <Empty text="No top-up orders have been recorded yet." />}
  </Panel>;
}

function GiftSettlementsTable({ rows }) {
  return <Panel title="Gift settlement history" description="Every gift calculates host, agency, company, and reusable-user shares in the same database transaction as the wallet movement.">
    <Table headers={["Gift", "Sender → recipient", "Room", "Gross value", "Settlement", "Policy"]}>{rows.map((item) => <tr key={item.id} className="hover:bg-[#f9fcfb]"><td className="px-5 py-4"><p className="font-semibold">{item.giftName} × {item.quantity}</p><p className="mt-1 text-[9px] text-[#849590]">{formatDate(item.createdAt)}</p></td><td><p>{item.sender} <span className="text-[#81928e]">→</span> {item.recipient}</p><p className="text-[9px] text-[#849590]">{item.senderId} → {item.recipientId ?? "—"}</p></td><td><code className="text-[10px]">{item.roomId ?? "Direct gift"}</code></td><td className="font-bold">{formatNumber(item.grossCoins)} coins</td><td>{item.settlement ? <div className="text-[10px] leading-5"><p>Host: {formatNumber(item.settlement.hostSalaryCoins)} · Agency: {formatNumber(item.settlement.agencyCoins)}</p><p>Company: {formatNumber(item.settlement.companyCoins)} · Reusable: {formatNumber(item.settlement.reusableCoins)}</p></div> : <span className="text-[#b45d2f]">Legacy record — no settlement</span>}</td><td>{item.settlement ? <><Status value={item.settlement.recipientType} /><p className="mt-1 text-[9px] text-[#849590]">v{item.settlement.policyVersion}</p></> : "—"}</td></tr>)}</Table>
    {!rows.length && <Empty text="No gift settlements have been recorded yet." />}
  </Panel>;
}

function LedgerTable({ rows }) {
  return <Panel title="Immutable wallet ledger" description="Wallet transaction rows are append-only. Corrections use a linked reversal or refund entry instead of altering historical financial records.">
    <Table headers={["Entry", "User", "Type", "Movement", "Amount", "Reference", "Recorded"]}>{rows.map((item) => <tr key={item.id} className="hover:bg-[#f9fcfb]"><td className="px-5 py-4"><p className="font-semibold">{item.title}</p><code className="text-[9px] text-[#087f74]">{item.id}</code></td><td><p>{item.user}</p><code className="text-[9px] text-[#849590]">{item.userId}</code></td><td><Status value={item.type} /></td><td><Status value={item.direction} /></td><td><p>{item.coins !== null ? `${formatNumber(item.coins)} coins` : "—"}</p><p className="text-[9px] text-[#71847f]">{item.diamonds !== null ? `${formatNumber(item.diamonds)} diamonds` : item.amount ? `${item.currency ?? ""} ${item.amount}` : ""}</p></td><td><code className="max-w-32 truncate text-[9px] text-[#71847f]">{item.referenceId ?? "—"}</code></td><td className="text-[10px] text-[#71847f]">{formatDate(item.createdAt)}</td></tr>)}</Table>
    {!rows.length && <Empty text="No ledger entries have been recorded yet." />}
  </Panel>;
}

function MobileIntegration({ integration }) {
  const state = (ready, readyLabel, waitingLabel) => <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${ready ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{ready ? readyLabel : waitingLabel}</span>;
  return <div className="grid gap-6 lg:grid-cols-[1.15fr_.85fr]"><Panel title="Android API release" description="New MegaLive Android work uses the versioned portal contract. The portal, not the app, owns payment confirmation, ledger calculation, and settlement."><div className="divide-y divide-[#edf2f1]">{[["Wallet overview", "GET /api/v1/wallet"], ["Top-up order", "POST /api/v1/wallet/top-ups"], ["Transfer coins", "POST /api/v1/wallet/transfers"], ["Withdrawal history and request", "GET/POST /api/v1/wallet/withdrawals"], ["Gift catalog and send", "GET /api/v1/gifts/catalog · POST /api/v1/gifts/send"]].map(([label, endpoint]) => <div key={label} className="flex items-center justify-between gap-4 py-4 text-xs"><span className="font-semibold">{label}</span><code className="rounded bg-[#edf7f5] px-2 py-1 text-[10px] text-[#087f74]">{endpoint}</code></div>)}</div></Panel><Panel title="Payment provider readiness" description="No secret values are displayed here."><div className="space-y-4"><Readiness label="Checkout gateway" detail="Creates trusted payment orders and checkout URLs." value={state(integration.checkoutConfigured, "Configured", "Provider selection needed")} /><Readiness label="Webhook signature" detail="Timestamped HMAC is required before credits are applied." value={state(integration.webhookConfigured, "Configured", "Secret needed")} /><Readiness label="Legacy webhook mode" detail="Keep disabled in production once the provider uses HMAC signatures." value={state(!integration.legacyWebhookAllowed, "Disabled", "Enabled — retire it")} /><p className="rounded-xl border border-[#d9e8e5] bg-[#f6fbfa] p-4 text-[11px] leading-5 text-[#526b67]">Payment provider selection, KYC document policy, and real payout execution remain operational decisions. This workspace records and controls the portal side safely once those services are chosen.</p></div></Panel></div>;
}

function Readiness({ label, detail, value }) { return <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold">{label}</p><p className="mt-1 text-[10px] leading-4 text-[#71847f]">{detail}</p></div>{value}</div>; }
function Panel({ title, description, action, children }) { return <section className="overflow-hidden rounded-2xl border border-[#dce8e5] bg-white shadow-[0_8px_30px_rgba(15,65,60,.04)]"><div className="flex flex-col gap-3 border-b border-[#e6eeec] p-5 sm:flex-row sm:items-start sm:justify-between"><div><h3 className="text-base font-bold">{title}</h3><p className="mt-1 max-w-2xl text-[11px] leading-5 text-[#81928e]">{description}</p></div>{action}</div>{children}</section>; }
function Table({ headers, children }) { return <div className="overflow-x-auto"><table className="w-full min-w-[920px] text-left text-xs"><thead><tr className="bg-[#f8fbfa] text-[10px] tracking-wider text-[#748883] uppercase">{headers.map((header, index) => <th key={header} className={index === 0 ? "px-5 py-3.5" : "px-3 py-3.5"}>{header}</th>)}</tr></thead><tbody className="divide-y divide-[#edf2f1]">{children}</tbody></table></div>; }
function Empty({ text }) { return <div className="py-16 text-center text-sm text-[#788b87]">{text}</div>; }
function Status({ value }) { const tone = /^(COMPLETED|MATCHED|CREDIT|HOST|NORMAL_USER)$/i.test(value) ? "bg-emerald-50 text-emerald-700" : /^(PENDING|APPROVED)$/i.test(value) ? "bg-amber-50 text-amber-700" : /^(REJECTED|FAILED|REQUIRES_BASELINE_OR_INVESTIGATION|DEBIT)$/i.test(value) ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-700"; return <span className={`inline-flex max-w-48 rounded-full px-2.5 py-1 text-[9px] font-bold ${tone}`}>{String(value).replaceAll("_", " ")}</span>; }
function ActionButton({ label, tone, onClick }) { const styles = tone === "emerald" ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50" : tone === "violet" ? "border-violet-200 text-violet-700 hover:bg-violet-50" : "border-red-200 text-red-600 hover:bg-red-50"; return <button type="button" onClick={onClick} className={`rounded-lg border px-2.5 py-2 text-[9px] font-bold ${styles}`}>{label}</button>; }

function WithdrawalActionModal({ selection, onClose }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [payoutReference, setPayoutReference] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { item, action } = selection;
  const labels = { APPROVE: "Approve withdrawal", REJECT: "Reject and refund", MARK_PAID: "Mark payout paid" };
  async function submit(event) {
    event.preventDefault();
    setSubmitting(true); setError("");
    try {
      const response = await fetch(`/api/admin/wallet/withdrawals/${encodeURIComponent(item.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, note, payoutReference }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message ?? "Unable to update this withdrawal.");
      router.refresh(); onClose();
    } catch (requestError) { setError(requestError.message); } finally { setSubmitting(false); }
  }
  return <div className="fixed inset-0 z-50 grid place-items-center bg-[#061c1a]/60 p-4" role="dialog" aria-modal="true" aria-labelledby="withdrawal-action-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl"><div className="flex items-start justify-between border-b border-[#e5ecea] px-6 py-5"><div><p className="text-[10px] font-bold tracking-widest text-[#16877d] uppercase">{item.id}</p><h2 id="withdrawal-action-title" className="mt-1 text-lg font-bold">{labels[action]}</h2><p className="mt-1 text-xs text-[#748782]">{item.host} · {item.currency} {item.amount} · {formatNumber(item.coins)} diamonds</p></div><button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-xl text-[#71847f] hover:bg-[#f1f6f5]">×</button></div><form onSubmit={submit} className="p-6"><div className="rounded-xl bg-[#f6fbfa] p-4 text-xs text-[#526b67]"><p><strong>Method:</strong> {item.method.replaceAll("_", " ")}</p><p className="mt-1"><strong>Account:</strong> {item.accountName} · {item.accountNumber}</p></div><label className="mt-5 block text-xs font-bold" htmlFor="withdrawal-note">{action === "REJECT" ? "Rejection reason" : "Review note (optional)"}</label><textarea id="withdrawal-note" value={note} onChange={(event) => setNote(event.target.value)} required={action === "REJECT"} rows="3" className="mt-2 w-full resize-none rounded-lg border border-[#dce6e4] p-3 text-xs outline-none focus:border-[#2ca89c]" placeholder={action === "REJECT" ? "Explain why the reserved salary balance is being returned..." : "Optional operational note..."} />{action === "MARK_PAID" && <><label className="mt-5 block text-xs font-bold" htmlFor="payout-reference">Provider payout reference</label><input id="payout-reference" value={payoutReference} onChange={(event) => setPayoutReference(event.target.value)} required maxLength="160" className="mt-2 h-11 w-full rounded-lg border border-[#dce6e4] px-3 text-xs outline-none focus:border-[#2ca89c]" placeholder="Reference returned by the payout provider" /></>}{action === "REJECT" && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-[11px] leading-5 text-amber-800">Rejecting this request creates an immutable refund ledger entry and restores the reserved host salary balance.</p>}{error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</p>}<div className="mt-6 flex justify-end gap-2 border-t border-[#e8efed] pt-5"><button type="button" onClick={onClose} disabled={submitting} className="h-10 rounded-lg border px-4 text-xs font-bold disabled:opacity-50">Cancel</button><button disabled={submitting} className={`h-10 rounded-lg px-5 text-xs font-bold text-white disabled:opacity-50 ${action === "REJECT" ? "bg-red-600" : action === "MARK_PAID" ? "bg-violet-600" : "bg-emerald-600"}`}>{submitting ? "Saving…" : labels[action]}</button></div></form></div></div>;
}

function formatNumber(value) { try { return BigInt(value ?? 0).toLocaleString(); } catch { return String(value ?? "—"); } }
function formatSigned(value) { const stringValue = String(value ?? "0"); return stringValue === "0" ? "0" : `${stringValue.startsWith("-") ? "" : "+"}${formatNumber(stringValue)}`; }
function formatDate(value) { return new Date(value).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }); }
