"use client";
import { useState } from "react";
export default function WelcomeSettings({ initial, canManage }) {
  const [form,setForm]=useState(initial),[busy,setBusy]=useState(false),[error,setError]=useState(""),[saved,setSaved]=useState(false);
  async function save(e) {
    e.preventDefault();setBusy(true);setError("");setSaved(false);
    try {
      const response=await fetch("/api/admin/notifications/settings",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(form)});
      const json=await response.json();if(!response.ok)throw new Error(json.error?.message||"Unable to save.");setForm(json.data);setSaved(true);
    } catch(e){setError(e.message)}finally{setBusy(false)}
  }
  const input="mt-2 w-full rounded-xl border border-[#d9e5e2] px-3 py-2.5 text-sm";
  return <form onSubmit={save} className="mb-7 rounded-2xl border border-[#dfe9e7] bg-white p-5"><h2 className="text-lg font-bold">First-time welcome</h2><p className="mt-2 text-sm text-[#71847f]">Sent once when a new phone or Google account is created. Changes apply to future signups only.</p><fieldset disabled={!canManage||busy} className="mt-4 space-y-4"><label className="flex gap-2 text-sm"><input type="checkbox" checked={form.welcomeEnabled} onChange={e=>setForm({...form,welcomeEnabled:e.target.checked})}/>Enable welcome notification</label><label className="block text-sm font-semibold">Title<input className={input} required maxLength={120} value={form.welcomeTitle} onChange={e=>setForm({...form,welcomeTitle:e.target.value})}/></label><label className="block text-sm font-semibold">Message<textarea className={input} required rows={3} maxLength={2000} value={form.welcomeBody} onChange={e=>setForm({...form,welcomeBody:e.target.value})}/></label>{canManage&&<button className="rounded-xl bg-[#183f3b] px-5 py-2.5 text-sm font-bold text-white">{busy?"Saving…":"Save welcome message"}</button>}</fieldset>{error&&<p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}{saved&&<p role="status" className="mt-3 text-sm text-emerald-700">Welcome settings saved.</p>}</form>;
}
