"use client";
import { useState, useTransition } from "react";
import { saveExchangeSettings, setUserExchangeAccess } from "./exchange-actions";

const field = "mt-2 h-11 w-full rounded-lg border border-[#cededb] bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#16877d]/30";
export default function ExchangeSettings({ settings, canManage }) {
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState(null);
  function submit(event, perUser) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setNotice(null);
    startTransition(async () => {
      try {
        if (perUser) await setUserExchangeAccess({ publicId: form.get("publicId"), enabled: form.get("access") === "true" });
        else await saveExchangeSettings({ enabled: form.get("enabled") === "on", diamondsPerCoin: form.get("diamondsPerCoin"), minDiamonds: form.get("minDiamonds") });
        setNotice({ ok: true, text: "Exchange settings saved." });
      } catch { setNotice({ ok: false, text: "Unable to save. Check the values, user ID and your permissions." }); }
    });
  }
  return <section className="mb-6 overflow-hidden rounded-2xl border border-[#dce8e5] bg-white">
    <div className="border-b border-[#e6eeec] p-5"><p className="text-xs font-semibold uppercase tracking-widest text-[#16877d]">Wallet policy</p><h3 className="mt-1 text-lg font-bold">Diamonds → Coins</h3><p className="mt-1 text-sm text-[#71847f]">Set the conversion rate and minimum. Fractional coins are rounded down; unused diamonds stay in the wallet.</p></div>
    <div className="grid gap-8 p-5 md:grid-cols-2">
      <form onSubmit={event => submit(event, false)}><fieldset disabled={!canManage || pending} className="space-y-4">
        <label className="flex items-center gap-3 text-sm font-semibold"><input type="checkbox" name="enabled" defaultChecked={settings.enabled} className="size-4 accent-[#16877d]"/>Enable diamond exchange</label>
        <div className="grid gap-4 sm:grid-cols-2"><label className="text-xs font-semibold text-[#526b67]">Diamonds per coin<input className={field} name="diamondsPerCoin" inputMode="numeric" pattern="[0-9]+" required defaultValue={settings.diamondsPerCoin}/></label><label className="text-xs font-semibold text-[#526b67]">Minimum diamonds<input className={field} name="minDiamonds" inputMode="numeric" pattern="[0-9]+" required defaultValue={settings.minDiamonds}/></label></div>
        <button className="rounded-lg bg-[#087f74] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Saving…" : "Save exchange policy"}</button>
      </fieldset></form>
      <form onSubmit={event => submit(event, true)} className="md:border-l md:border-[#e6eeec] md:pl-8"><fieldset disabled={!canManage || pending} className="space-y-4"><div><h4 className="text-sm font-bold">Individual account access</h4><p className="mt-1 text-xs text-[#71847f]">Account access also requires the global exchange policy to be enabled.</p></div><div className="grid gap-4 sm:grid-cols-2"><label className="text-xs font-semibold text-[#526b67]">User public ID<input name="publicId" required placeholder="USR-123456 / TLN-123456" className={field}/></label><label className="text-xs font-semibold text-[#526b67]">Exchange access<select name="access" className={field}><option value="false">Disabled</option><option value="true">Enabled</option></select></label></div><button className="rounded-lg border border-[#cededb] px-5 py-2.5 text-sm font-semibold disabled:opacity-50">Update account</button></fieldset></form>
    </div>{notice && <p role="status" className={`mx-5 mb-5 rounded-lg p-3 text-sm ${notice.ok ? "bg-[#e9f7f1] text-[#087f74]" : "bg-red-50 text-red-700"}`}>{notice.text}</p>}
  </section>;
}
