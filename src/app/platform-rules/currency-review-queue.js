"use client";
import { useEffect, useState } from "react";
import { reviewCurrency } from "./currency-actions";

export default function CurrencyReviewQueue() {
  const [status, setStatus] = useState("REVIEW"), [kind, setKind] = useState("ALL"), [pages, setPages] = useState([""]);
  const [data, setData] = useState(null), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(""), [revision, refresh] = useState(0);
  const cursor = pages.at(-1);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin/wallet/currency-requests?${new URLSearchParams({ status, kind, cursor })}`, { signal: controller.signal, cache: "no-store" })
      .then(async r => { const j = await r.json(); if (!r.ok) throw Error(j.error?.message || "Unable to load requests."); return j.data; })
      .then(value => { setData(value); setLoading(false); })
      .catch(e => { if (!controller.signal.aborted) { setError(e.message); setLoading(false); } });
    return () => controller.abort();
  }, [status, kind, cursor, revision]);
  function navigate(next) { setData(null); setLoading(true); setError(""); setPages(next); }
  async function review(event, id) {
    event.preventDefault(); if (busy) return;
    const form = new FormData(event.currentTarget);
    if (!window.confirm(`Submit ${form.get("action")} for ${id}? This can affect the user's balances. Verify the request and review note first.`)) return;
    setBusy(true); setError("");
    try {
      await reviewCurrency({ id, action: form.get("action"), note: form.get("note"), hash: form.get("hash"), paymentVerified: form.get("paymentVerified") === "on" });
      navigate([""]); refresh(n => n + 1);
    } catch { setError("Review failed. Refresh and check the status, verification details and permissions before retrying."); }
    finally { setBusy(false); }
  }
  return <section className="space-y-4 rounded-xl border bg-white p-4"><h3 className="font-bold">Currency requests: USDT withdrawals & reseller exchange</h3>
    <p className="text-sm text-slate-500">Awaiting review is oldest first. Review actions use the existing balance, payment-verification and ledger protections.</p>
    <div className="flex flex-wrap gap-3"><select aria-label="Currency request status" disabled={busy} value={status} onChange={e => { setStatus(e.target.value); navigate([""]); }}>{["REVIEW", "PENDING", "APPROVED", "COMPLETED", "REJECTED", "CANCELLED", "PENDING_EXTERNAL", "ALL"].map(v => <option key={v}>{v}</option>)}</select><select aria-label="Request kind" disabled={busy} value={kind} onChange={e => { setKind(e.target.value); navigate([""]); }}>{["ALL", "USDT", "REDEMPTION", "RESELLER_TRANSFER"].map(v => <option key={v}>{v}</option>)}</select><button disabled={busy || loading} onClick={() => { navigate([""]); refresh(n => n + 1); }}>Refresh</button></div>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {loading ? <p role="status">Loading requests…</p> : <>{!data?.items.length && <p>No requests in this view.</p>}{data?.items.map(row => <article key={row.id} className="rounded-xl border p-4">
      <b>{row.user?.name} · {row.user?.publicId} · {row.kind}</b><p className="break-all text-xs">{row.id} · {row.createdAt}</p>
      <p>{row.diamonds} Diamonds · {row.status} · Coins: {row.quotedCoins ?? "N/A"} · Net USDT micro-units: {row.netUsdtMicros ?? "N/A"}</p>
      <p className="break-all">{row.destination ?? row.recipientPublicId}</p>{row.payoutHash && <p className="break-all">TRON hash: {row.payoutHash}</p>}{row.reviewNote && <p>{row.reviewNote}</p>}
      {["PENDING", "APPROVED"].includes(row.status) && <form onSubmit={e => review(e, row.id)}><fieldset disabled={busy} className="mt-3 grid gap-3 md:grid-cols-2">
        <select name="action" className="rounded-lg border p-2">{row.status === "PENDING" && <option value="APPROVE">Approve</option>}<option value="REJECT">Reject and refund</option>{row.status === "APPROVED" && row.kind === "USDT" && <option value="MARK_PAID">Confirm manually paid</option>}</select>
        <label className="text-xs"><input type="checkbox" name="paymentVerified"/> I verified the successful TRC20 payment, destination and amount (required to mark paid).</label>
        <input name="hash" aria-label="TRON transaction hash" placeholder="TRON hash (when paid)" className="rounded-lg border p-2"/><input required maxLength={1000} name="note" aria-label="Review note" placeholder="Review reason / verification note" className="rounded-lg border p-2"/><button className="rounded-lg bg-teal-700 p-2 text-white">Submit review</button>
      </fieldset></form>}
    </article>)}</>}
    <div className="flex gap-4"><button disabled={busy || loading || pages.length < 2} onClick={() => navigate(pages.slice(0, -1))}>Previous</button><span>Page {pages.length}</span><button disabled={busy || loading || !data?.nextCursor} onClick={() => navigate([...pages, data.nextCursor])}>Next</button></div>
  </section>;
}
