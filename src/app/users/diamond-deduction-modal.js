"use client";
import { useRef, useState } from "react";
import { deductUserDiamonds } from "../database-actions";

export default function DiamondDeductionModal({ user, onClose, onSaved }) {
  const request = useRef(null);
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault();
    if (running.current) return;
    if (!request.current) {
      const form = new FormData(event.currentTarget);
      const amount = String(form.get("amount")).trim(), reason = String(form.get("reason")).trim();
      if (!/^\d+$/.test(amount) || BigInt(amount) < 1n || BigInt(amount) > 9223372036854775807n || !reason || reason.length > 500) { setError("Enter a positive whole-number amount and a reason (maximum 500 characters)."); return; }
      if (!window.confirm(`Deduct ${BigInt(amount).toLocaleString()} diamonds from ${user.name} (${user.id})?`)) return;
      request.current = { amount, reason, id: crypto.randomUUID() };
      setLocked(true);
    }
    running.current = true; setBusy(true); setError("");
    try {
      const { amount, reason, id } = request.current;
      const result = await deductUserDiamonds(user.id, amount, reason, id);
      if (result.error) { setError(result.error); request.current = null; setLocked(false); return; }
      onSaved(result.balance);
    } catch { setError("Deduction could not be confirmed. Retry the same details safely. Check wallet history before starting another deduction."); }
    finally { running.current = false; setBusy(false); }
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="deduct-diamonds-title"><form onSubmit={submit} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-xl">
    <h2 id="deduct-diamonds-title" className="text-lg font-bold">Deduct diamonds</h2>
    <p>{user.name} · {user.id}</p><p className="text-sm">Available diamonds (last loaded): {BigInt(user.diamondBalance).toLocaleString()}</p>
    <label className="block text-sm">Diamonds to deduct<input autoFocus required name="amount" inputMode="numeric" pattern="[0-9]+" disabled={locked} className="mt-1 w-full rounded-lg border p-2" /></label>
    <label className="block text-sm">Reason<textarea required name="reason" maxLength={500} disabled={locked} className="mt-1 w-full rounded-lg border p-2" /></label>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <div className="flex justify-end gap-3"><button type="button" disabled={busy} onClick={onClose} className="rounded-lg border px-4 py-2">Close</button><button disabled={busy} className="rounded-lg bg-red-700 px-4 py-2 text-white">{busy ? "Saving…" : locked ? "Retry same deduction" : "Deduct diamonds"}</button></div>
  </form></div>;
}
