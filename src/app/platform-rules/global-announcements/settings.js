"use client";
import { useState } from "react";

const labels = {
  BIG_GIFT: ["Big gift sent", "Recorded Coins spent on one recipient's gift transaction. Multi-recipient shares are not counted twice; combo taps are not summed."],
  GAME_WIN: ["Big game win", "Net profit (payout minus wager) across the player's complete settled Coin game round. Free play points and external providers are excluded."],
  LUCKY_RETURN: ["Big Lucky return", "Coins returned for one confirmed Lucky draw—not profit. Uses its actual cost as the multiplier denominator."],
};
export default function Settings({ initial, canManage }) {
  const [value, setValue] = useState(initial), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  async function save(event) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/global-announcements", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error?.message ?? "Unable to save settings.");
      setValue(body.data); setMessage("Saved. Only future activity can produce new announcements.");
    } catch (e) { setMessage(e.message); } finally { setBusy(false); }
  }
  return <form onSubmit={save} className="space-y-5">
    <fieldset disabled={!canManage || busy} className="space-y-5">
      {Object.entries(labels).map(([type, [title, description]]) => <section key={type} className="rounded-xl border bg-white p-5">
        <label className="flex items-center gap-3 text-lg font-semibold"><input type="checkbox" checked={value.rules[type].enabled}
          onChange={e => setValue(v => ({ ...v, rules: { ...v.rules, [type]: { ...v.rules[type], enabled: e.target.checked } } }))} />{title}</label>
        <p className="my-3 text-sm text-slate-600">{description}</p>
        <label className="block">Minimum Coins <input required inputMode="numeric" pattern="[1-9][0-9]{0,17}" className="ml-3 rounded border p-2"
          value={value.rules[type].minimumCoins} onChange={e => setValue(v => ({ ...v, rules: { ...v.rules, [type]: { ...v.rules[type], minimumCoins: e.target.value } } }))} /></label>
      </section>)}
      <label className="block">Cooldown per sender and announcement type (1–300 seconds)
        <input type="number" min="1" max="300" required className="ml-3 rounded border p-2" value={value.cooldownSeconds} onChange={e => setValue(v => ({ ...v, cooldownSeconds: Number(e.target.value) }))} /></label>
      <label className="block">Announcement lifetime (15–120 seconds)
        <input type="number" min="15" max="120" required className="ml-3 rounded border p-2" value={value.lifetimeSeconds} onChange={e => setValue(v => ({ ...v, lifetimeSeconds: Number(e.target.value) }))} /></label>
      <p className="text-sm text-slate-600">During cooldown, additional qualifying messages are suppressed, not queued. Expired messages are discarded. Refresh this page if another admin changed the settings.</p>
      <button className="rounded bg-teal-700 px-5 py-3 text-white disabled:opacity-50">{busy ? "Saving…" : "Save settings"}</button>
    </fieldset>
    <p role="status" aria-live="polite">{message}</p>
  </form>;
}
