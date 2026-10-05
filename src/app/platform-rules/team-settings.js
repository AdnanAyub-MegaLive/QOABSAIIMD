"use client";
import { useState } from "react";
import { MANAGEMENT_ROLE_ORDER, displayApplicationRole } from "@/lib/user-roles";
import { saveTeamPolicy, setCountryHeadDesignation } from "./team-actions";

export default function TeamSettings({ initial, canManage }) {
  const [policy, setPolicy] = useState(initial);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [publicId, setPublicId] = useState(""), [designation, setDesignation] = useState("TITLED");
  const inputClass = "rounded-lg border border-[#dce8e5] bg-white px-3 py-2 text-sm disabled:opacity-60";
  const buttonClass = "rounded-lg bg-[#16877d] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50";
  const change = (index, changes) => setPolicy(p => ({ ...p, limits: p.limits.map((row, i) => i === index ? { ...row, ...changes } : row) }));
  async function run(action) { setBusy(true); setMessage(""); try { await action(); setMessage("Saved successfully."); } catch (error) { setMessage(error.message || "Unable to save."); } finally { setBusy(false); } }
  return <section className="mb-6 rounded-2xl border border-[#dce8e5] bg-white p-5 md:p-6">
    <h3 className="text-lg font-bold">Management hierarchy</h3>
    <p className="mt-1 text-sm text-[#71847f]">Reporting permissions and capacity are enforced by the server. Changing limits does not detach existing teams.</p>
    <fieldset disabled={!canManage || busy} className="mt-5 space-y-5">
      <div className="flex flex-wrap items-center gap-5"><label className="text-sm">Count limits across <select className={`${inputClass} ml-2`} value={policy.limitScope} onChange={e => setPolicy({ ...policy, limitScope: e.target.value })}><option value="DIRECT">Direct reports</option><option value="SUBTREE">Whole subtree</option></select></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={policy.allowAncestorRemoval} onChange={e => setPolicy({ ...policy, allowAncestorRemoval: e.target.checked })}/>Allow higher supervisors in the same chain to remove members</label></div>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-[#f7faf9] text-[#71847f]"><tr><th className="p-3">Supervisor</th><th className="p-3">Member role</th><th className="p-3">Maximum</th><th className="p-3">Action</th></tr></thead><tbody>{policy.limits.map((row, i) => <tr key={i} className="border-t border-[#e4eeeb]"><td className="p-3"><select aria-label="Supervisor role" className={inputClass} value={row.supervisorRole} onChange={e => change(i, { supervisorRole: e.target.value })}>{MANAGEMENT_ROLE_ORDER.filter(r => r !== "BD").map(r => <option key={r}>{r}</option>)}</select></td><td className="p-3"><select aria-label="Member role" className={inputClass} value={row.memberRole} onChange={e => change(i, { memberRole: e.target.value })}>{MANAGEMENT_ROLE_ORDER.filter(r => r !== "MANAGER").map(r => <option key={r} value={r}>{displayApplicationRole(r)}</option>)}</select></td><td className="p-3"><input aria-label="Maximum members, blank for unlimited" className={`${inputClass} w-36`} type="number" min="0" max="100000" placeholder="Unlimited" value={row.max ?? ""} onChange={e => change(i, { max: e.target.value === "" ? null : Number(e.target.value) })}/></td><td className="p-3"><button className="text-red-600" onClick={() => setPolicy(p => ({ ...p, limits: p.limits.filter((_, n) => n !== i) }))}>Remove rule</button></td></tr>)}</tbody></table></div>
      <div className="flex gap-3"><button className={inputClass} onClick={() => setPolicy(p => ({ ...p, limits: [...p.limits, { supervisorRole: "MANAGER", memberRole: "COUNTRY_HEAD", max: null }] }))}>Add reporting rule</button><button className={buttonClass} onClick={() => run(() => saveTeamPolicy(policy))}>Save team policy</button></div>
      <div className="border-t border-[#e4eeeb] pt-5"><h4 className="font-semibold">Country Head designation</h4><p className="mb-3 mt-1 text-xs text-[#71847f]">Designation only: different prop or moderation powers are not enabled by this setting.</p><div className="flex flex-wrap gap-3"><input aria-label="Country Head public ID" className={inputClass} placeholder="USR-123456" value={publicId} onChange={e => setPublicId(e.target.value)}/><select aria-label="Designation" className={inputClass} value={designation} onChange={e => setDesignation(e.target.value)}><option value="TITLED">Titled</option><option value="ACTUAL">Actual</option></select><button className={buttonClass} onClick={() => run(() => setCountryHeadDesignation({ publicId, designation }))}>Set designation</button></div></div>
    </fieldset>
    {message && <p role="status" className="mt-4 text-sm">{message}</p>}
  </section>;
}
