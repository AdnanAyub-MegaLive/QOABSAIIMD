"use client";

import { useRef, useState } from "react";
import { adjustUserCoins } from "../database-actions";

export default function CoinAdjustmentModal({ user, operation, onClose, onSaved }) {
  const request = useRef(null);
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState("");
  const title = operation === "add" ? "Add coins" : "Remove coins";
  async function submit(event) {
    event.preventDefault();
    if (running.current) return;
    if (!request.current) {
      const data = new FormData(event.currentTarget);
      const amount = String(data.get("amount")).trim(), reason = String(data.get("reason")).trim();
      if (!/^\d+$/.test(amount) || BigInt(amount) < 1n || BigInt(amount) > 9223372036854775807n || !reason || reason.length > 500) {
        setError("Enter a positive whole-number coin amount and a reason of up to 500 characters."); return;
      }
      if (!window.confirm(`${title}: ${BigInt(amount).toLocaleString()} coins for ${user.name} (${user.id})?`)) return;
      request.current = { amount, reason, id: crypto.randomUUID() };
      setLocked(true);
    }
    running.current = true; setBusy(true); setError("");
    try {
      const { amount, reason, id } = request.current;
      const balance = await adjustUserCoins(user.id, operation, amount, reason, id);
      onSaved(balance);
    } catch {
      setError("Adjustment could not be confirmed. Retry these same details safely. Before closing or starting another adjustment, check the account's adjustment history.");
    } finally { running.current = false; setBusy(false); }
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="adjust-coins-title">
    <form onSubmit={submit} className="max-h-[90vh] w-full max-w-md space-y-4 overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
      <h2 id="adjust-coins-title" className="text-lg font-bold">{title}</h2>
      <p className="text-sm">{user.name} · {user.id}</p>
      <p className="text-sm">Last loaded balance: {BigInt(user.balance).toLocaleString()} coins. The server checks the current balance when saving.</p>
      <label className="block text-sm">Coin amount<input autoFocus name="amount" inputMode="numeric" pattern="[0-9]+" required disabled={locked} className="mt-1 w-full rounded-lg border p-2 disabled:bg-gray-100" /></label>
      <label className="block text-sm">Reason<textarea name="reason" required maxLength={500} disabled={locked} className="mt-1 w-full rounded-lg border p-2 disabled:bg-gray-100" /></label>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-3"><button type="button" disabled={busy} onClick={onClose} className="rounded-lg border px-4 py-2 disabled:opacity-50">Close</button><button disabled={busy} className="rounded-lg bg-teal-800 px-4 py-2 text-white disabled:opacity-50">{busy ? "Saving…" : locked ? "Retry same adjustment" : title}</button></div>
    </form>
  </div>;
}
