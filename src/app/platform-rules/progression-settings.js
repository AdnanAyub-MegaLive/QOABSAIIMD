"use client";
import { useState } from "react";
import { publishProgression } from "./progression-actions";
import { MAX_LEVEL_POINTS, validateProgressionThresholds } from "@/lib/progression-thresholds";
import GiftXpSettings from "./gift-xp-settings";
import { giftXpEarningRules } from "@/lib/progression-earning-policy";
export default function ProgressionSettings({ initial, canManage }) {
  const [levels,setLevels]=useState([...initial.levels].sort((a,b)=>a.track.localeCompare(b.track)||a.level-b.level));
  const [rules,setRules]=useState(initial.rules ?? []);
  const [enabled,setEnabled]=useState(initial.enabled),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[fields,setFields]=useState({});
  function edit(index,value){setLevels(rows=>rows.map((r,i)=>i===index?{...r,thresholdPoints:value}:r));setFields({});setMessage("");}
  function add(track){
    if(!canManage||busy)return;
    const rows=levels.filter(r=>r.track===track).sort((a,b)=>a.level-b.level),last=rows.at(-1);
    if(!/^\d+$/.test(String(last?.thresholdPoints??0))){setMessage("Enter a valid XP threshold before adding a level.");return;}
    const threshold=BigInt(last?.thresholdPoints??0)+900n;
    if(threshold>MAX_LEVEL_POINTS){setMessage("The suggested next threshold exceeds the supported XP limit.");return;}
    setLevels(old=>[...old,{track,level:(last?.level??0)+1,thresholdPoints:String(threshold),badgeAssetId:null,benefits:[]}]);
    setFields({});setMessage("New level added to the draft. Set its cumulative XP before saving.");
  }
  function remove(track,level){
    if(!canManage||busy||level===0)return;
    if(!window.confirm(`Remove ${track==="USER"?"Wealth":"Charm"} Level ${level}? After saving, account levels will be recalculated from remaining thresholds. Earned XP stays unchanged.`))return;
    setLevels(rows=>rows.filter(row=>row.track!==track||row.level!==level));setFields({});
    setMessage("Level removed from draft. Save level thresholds to apply this change.");
  }
  async function save(){
    if(!canManage||busy)return;
    setFields({});setMessage("");
    if(enabled&&!rules.length){setMessage("Review and approve the gift XP earning rules below before enabling awards.");return;}
    try{validateProgressionThresholds(levels);}catch(error){setFields(error.fields??{});setMessage(error.message);return;}
    setBusy(true);
    try{
      const result=await publishProgression({enabled,levels,rules});
      if(!result?.success){setFields(result?.error?.fields??{});setMessage(result?.error?.message??"Unable to save level rules.");return;}
      setMessage(`Published version ${result.version}. All accounts now use these thresholds; earned XP is preserved.`);
    }catch{setMessage("The page may be out of date or the connection was interrupted. Copy your unsaved changes, reload the page, and check the saved rules before trying again.");}
    finally{setBusy(false);}
  }
  return <><section className="mb-6 rounded-2xl border border-[#dce8e5] bg-white p-6">
    <h3 className="text-lg font-bold">Wealth & Charm XP levels</h3>
    {initial.configured===false&&<p role="status" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Account levels have not been configured. This is an unsaved draft; XP awards remain disabled. Add thresholds and save to create the first configuration.</p>}
    <p className="my-3 text-sm text-[#71847f]">Enter total lifetime XP required for each level, not XP earned since the previous level. Every threshold must be greater than the previous one. Example: Level 0 = 0, Level 1 = 900, Level 2 = 1800. Saving recalculates account levels but preserves earned XP and wallet balances.</p>
    <label className="text-sm"><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)} disabled={!canManage||busy}/> Enable gift XP awards</label>
    <section className="mt-5 rounded-xl border border-teal-200 bg-teal-50 p-4" aria-label="Gift XP earning rules">
      <h4 className="font-semibold">Gift XP earning rules</h4>
      <p className="mt-2 text-sm">Wealth uses configured Sender XP × quantity. Charm uses configured Receiver XP × quantity for Hosts/Talents with a linked account. Self-gifts earn Charm XP for every user, including non-hosts. Paid, Lucky, backpack and blind-box gifts count, including self-gifts. Lucky winnings do not add XP. Existing VIP sender XP multipliers still apply.</p>
      <p className="mt-2 text-sm">Set Sender XP and Receiver XP in each gift’s upload/edit form. Approval prepares a draft; Save level thresholds publishes it for future gifts. Past gifts are not replayed.</p>
      <button type="button" disabled={!canManage||busy} onClick={()=>{setRules(giftXpEarningRules());setMessage("Gift XP earning rules approved in this draft. Save level thresholds to publish.");}} className="mt-3 rounded-lg bg-teal-800 px-4 py-2 text-sm text-white disabled:opacity-50">Approve configured gift XP rules</button>
      <p className="mt-2 text-sm">{rules.length?`${rules.length} earning rules in this draft.`:"No earning rules configured. Approval is required to enable awards."}</p>
      {rules.length>0&&<div className="mt-3 max-h-64 overflow-auto"><table className="w-full text-left text-xs"><thead><tr><th className="p-2">Level</th><th className="p-2">Gift source</th><th className="p-2">Recipient</th><th className="p-2">XP basis / rate</th></tr></thead><tbody>{rules.map((r,i)=><tr key={i}><td className="p-2">{r.track==="USER"?"Wealth":"Charm"}</td><td className="p-2">{r.source}</td><td className="p-2">{r.recipientType}</td><td className="p-2">{r.basis} × {r.numerator}/{r.denominator}</td></tr>)}</tbody></table></div>}
    </section>
    <div className="mt-5 grid gap-6 md:grid-cols-2">{["USER","CHARM"].map(track=><div key={track} className="rounded-xl border p-4">
      <h4 className="mb-4 font-semibold">{track==="USER"?"Wealth Level — Sending":"Charm Level — Receiving"}</h4>
      <div role="region" aria-label={`${track==="USER"?"Wealth":"Charm"} level thresholds`} tabIndex={0} className="max-h-[480px] overflow-y-auto overscroll-contain pr-2">
      {levels.map((r,index)=>r.track===track&&<div key={`${r.level}:${index}`} className="mb-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-3"><span>Level {r.level}</span>
          <input aria-label={`${track} level ${r.level} XP`} aria-invalid={Boolean(fields[`${track}:${r.level}`])} aria-describedby={fields[`${track}:${r.level}`]?`xp-error-${track}-${index}`:undefined} className={`w-44 rounded-lg border p-2 ${fields[`${track}:${r.level}`]?"border-red-500":""}`} type="text" inputMode="numeric" pattern="[0-9]*" value={r.thresholdPoints} disabled={!canManage||busy||r.level===0} onChange={e=>edit(index,e.target.value)}/>
          {r.level!==0&&<button type="button" disabled={!canManage||busy} onClick={()=>remove(track,r.level)} aria-label={`Remove ${track} level ${r.level}`} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 disabled:opacity-50">Remove</button>}
        </div>
        {fields[`${track}:${r.level}`]&&<p id={`xp-error-${track}-${index}`} className="mt-1 text-red-600">{fields[`${track}:${r.level}`]}</p>}
      </div>)}
      </div>
      <button type="button" onClick={()=>add(track)} disabled={!canManage||busy} className="mt-3 rounded-lg border px-4 py-2 text-sm">+ Add level</button>
    </div>)}</div>
    <button type="button" disabled={!canManage||busy} onClick={save} className="mt-5 rounded-lg bg-[#16877d] px-4 py-2 text-sm text-white">{busy?"Saving…":"Save level thresholds"}</button>
    {message&&<p role="status" className="mt-3 text-sm">{message}</p>}
  </section><GiftXpSettings canManage={canManage}/></>;
}
