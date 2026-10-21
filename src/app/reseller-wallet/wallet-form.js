"use client";
import { useRef, useState } from "react";
import { ArrowRight, CheckCircle2, CircleAlert, Coins, LockKeyhole, ShieldCheck, Wallet } from "lucide-react";
import { fundReseller } from "./actions";

const format = value => BigInt(value || "0").toLocaleString("en-US");
const field = "mt-2 block w-full rounded-xl border border-[#d7e4e1] bg-[#f8fbfa] px-4 py-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100 disabled:opacity-60";
export default function Form({ userId, business, personal, disabled = false }) {
  const [balance, setBalance] = useState(business), [personalBalance, setPersonal] = useState(personal);
  const [coins, setCoins] = useState(""), [reason, setReason] = useState("");
  const [message, setMessage] = useState(""), [success, setSuccess] = useState(false), [pending, setPending] = useState(false);
  const key = useRef(null), busy = useRef(false);
  const valid = /^\d{1,9}$/.test(coins) && BigInt(coins) > 0n && BigInt(coins) <= 500000000n;
  async function submit(e) {
    e.preventDefault(); if (busy.current || disabled || !valid || !reason.trim()) return;
    busy.current = true; key.current ??= crypto.randomUUID(); setPending(true); setMessage(""); setSuccess(false);
    try {
      const result = await fundReseller(userId, coins, key.current, reason);
      setBalance(result.businessCoins); setPersonal(result.personalCoins); setSuccess(true);
      setMessage(`Business wallet funded. Reference: ${result.referenceId}`);
      key.current = null; setCoins(""); setReason("");
    } catch (error) { setMessage(error.message || "Funding could not be confirmed. Retry with the same details."); }
    finally { busy.current = false; setPending(false); }
  }
  return <div className="space-y-6">
    <div className="grid gap-4 sm:grid-cols-2">
      <section className="relative overflow-hidden rounded-2xl bg-[#075e56] p-6 text-white shadow-sm"><div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-widest text-teal-100">Business Coins</p><Wallet size={22} className="text-teal-200"/></div><p className="mt-5 break-all text-3xl font-bold tabular-nums md:text-4xl">{format(balance)} <span className="text-sm font-normal text-teal-100">Coins</span></p><p className="mt-3 text-xs leading-5 text-teal-100">Available for customer recharge and personal self-recharge.</p></section>
      <section className="rounded-2xl border border-[#dce8e5] bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-widest text-[#637b75]">Personal Coins</p><LockKeyhole size={21} className="text-[#718580]"/></div><p className="mt-5 break-all text-3xl font-bold tabular-nums md:text-4xl">{format(personalBalance)} <span className="text-sm font-normal text-[#637b75]">Coins</span></p><p className="mt-3 text-xs leading-5 text-[#637b75]">Separate personal balance. Unchanged by this funding action.</p></section>
    </div>
    <div className="grid items-start gap-6 xl:grid-cols-[1.65fr_1fr]">
      <form onSubmit={submit} aria-busy={pending} className="rounded-2xl border border-[#dce8e5] bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3"><span className="rounded-xl bg-teal-50 p-3 text-teal-700"><Coins size={21}/></span><div><h3 className="text-lg font-bold">Add business funds</h3><p className="mt-1 text-xs text-[#637b75]">Credit this reseller’s business wallet only.</p></div></div>
        {disabled && <p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">This account is not active. Funding is disabled.</p>}
        <label htmlFor="funding-coins" className="text-xs font-bold">Amount in Coins</label><input id="funding-coins" className={field} value={coins} onChange={e=>setCoins(e.target.value)} name="coins" inputMode="numeric" type="number" min="1" max="500000000" step="1" placeholder="Enter Coin amount" required disabled={pending || disabled}/><p className="mt-2 text-xs text-[#718580]">Whole Coins only · Maximum 500,000,000 per recharge</p>
        <div className="mt-5"><label htmlFor="funding-reason" className="text-xs font-bold">Funding reason</label><textarea id="funding-reason" className={`${field} min-h-24 resize-y`} value={reason} onChange={e=>setReason(e.target.value)} name="reason" maxLength={500} placeholder="Add a payment reference or explain this recharge…" required disabled={pending || disabled}/><p className="mt-2 text-right text-xs text-[#718580]">{reason.length} / 500</p></div>
        <div className="my-6 space-y-3 rounded-xl bg-[#f4f8f7] p-4 text-sm"><div className="flex justify-between gap-3 text-[#637b75]"><span>Business balance now</span><span className="tabular-nums">{format(balance)}</span></div><div className="flex justify-between gap-3 text-[#637b75]"><span>Amount to add</span><span className="tabular-nums">+ {valid ? format(coins) : "—"}</span></div><div className="flex justify-between gap-3 border-t border-[#dce8e5] pt-3 font-bold"><span>Projected business balance</span><span className="break-all text-right tabular-nums text-teal-800">{valid ? format(String(BigInt(balance)+BigInt(coins))) : "—"}</span></div></div>
        <button disabled={pending || disabled || !valid || !reason.trim()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#087f74] px-5 py-3.5 text-sm font-bold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50">{pending ? "Funding business wallet…" : "Fund business wallet"}<ArrowRight size={17}/></button>
        <p className="mt-3 text-center text-xs text-[#718580]">Recorded in the business ledger and admin audit log.</p>
        {message && <div role={success ? "status" : "alert"} className={`mt-4 flex items-start gap-2 rounded-xl border p-4 text-sm ${success ? "border-teal-200 bg-teal-50 text-teal-900" : "border-red-200 bg-red-50 text-red-900"}`}>{success ? <CheckCircle2 size={18} className="shrink-0"/> : <CircleAlert size={18} className="shrink-0"/>}<div className="break-all">{message}{!success && <p className="mt-2 text-xs">If the connection failed, retry with the same amount and reason.</p>}</div></div>}
      </form>
      <aside className="rounded-2xl border border-[#dce8e5] bg-white p-6"><div className="flex items-center gap-2 font-bold"><ShieldCheck size={19} className="text-teal-700"/><h3>How this wallet works</h3></div><ol className="mt-5 space-y-5 text-sm">{[["Company funding", "Admin recharges and approved Diamond redemptions enter the business wallet."],["One-way recharge", "Business Coins can recharge customers or the reseller’s personal account."],["Personal stays personal", "Personal Coins cannot move back into the business wallet."]].map(([title,text],i)=><li key={title} className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-50 text-xs font-bold text-teal-700">{i+1}</span><div><p className="font-semibold">{title}</p><p className="mt-1 text-xs leading-5 text-[#637b75]">{text}</p></div></li>)}</ol><p className="mt-6 border-t border-[#dce8e5] pt-4 text-xs leading-5 text-[#637b75]">Existing balances and historical records are not redistributed by this page.</p></aside>
    </div>
  </div>;
}
