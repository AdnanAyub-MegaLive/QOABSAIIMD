"use client";
import { useState } from "react";
import { publishProgression } from "./progression-actions";
import { MAX_LEVEL_POINTS, validateProgressionThresholds } from "@/lib/progression-thresholds";
import GiftXpSettings from "./gift-xp-settings";
export default function ProgressionSettings({ initial, canManage }) {
  const [levels,setLevels]=useState([...initial.levels].sort((a,b)=>a.track.localeCompare(b.track)||a.level-b.level));
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
    try{validateProgressionThresholds(levels);}catch(error){setFields(error.fields??{});setMessage(error.message);return;}
    setBusy(true);
    try{
      const result=await publishProgression({enabled,levels,rules:initial.rules});
      if(!result?.success){setFields(result?.error?.fields??{});setMessage(result?.error?.message??"Unable to save level rules.");return;}
      setMessage(`Published version ${result.version}. All accounts now use these thresholds; earned XP is preserved.`);
    }catch{setMessage("The page may be out of date or the connection was interrupted. Copy your unsaved changes, reload the page, and check the saved rules before trying again.");}
    finally{setBusy(false);}
  }
  return <><section className="mb-6 rounded-2xl border border-[#dce8e5] bg-white p-6">
    <h3 className="text-lg font-bold">Wealth & Charm XP levels</h3>
    <p className="my-3 text-sm text-[#71847f]">Enter total lifetime XP required for each level, not XP earned since the previous level. Every threshold must be greater than the previous one. Example: Level 0 = 0, Level 1 = 900, Level 2 = 1800. Saving recalculates account levels but preserves earned XP and wallet balances.</p>
    <label className="text-sm"><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)} disabled={!canManage||busy}/> Enable gift XP awards</label>
    <div className="mt-5 grid gap-6 md:grid-cols-2">{["USER","CHARM"].map(track=><div key={track} className="rounded-xl border p-4">
      <h4 className="mb-4 font-semibold">{track==="USER"?"Wealth Level — Sending":"Charm Level — Receiving"}</h4>
      {levels.map((r,index)=>r.track===track&&<div key={`${r.level}:${index}`} className="mb-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-3"><span>Level {r.level}</span>
          <input aria-label={`${track} level ${r.level} XP`} aria-invalid={Boolean(fields[`${track}:${r.level}`])} aria-describedby={fields[`${track}:${r.level}`]?`xp-error-${track}-${index}`:undefined} className={`w-44 rounded-lg border p-2 ${fields[`${track}:${r.level}`]?"border-red-500":""}`} type="text" inputMode="numeric" pattern="[0-9]*" value={r.thresholdPoints} disabled={!canManage||busy||r.level===0} onChange={e=>edit(index,e.target.value)}/>
          {r.level!==0&&<button type="button" disabled={!canManage||busy} onClick={()=>remove(track,r.level)} aria-label={`Remove ${track} level ${r.level}`} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 disabled:opacity-50">Remove</button>}
        </div>
        {fields[`${track}:${r.level}`]&&<p id={`xp-error-${track}-${index}`} className="mt-1 text-red-600">{fields[`${track}:${r.level}`]}</p>}
      </div>)}
      <button type="button" onClick={()=>add(track)} disabled={!canManage||busy} className="mt-3 rounded-lg border px-4 py-2 text-sm">+ Add level</button>
    </div>)}</div>
    <button type="button" disabled={!canManage||busy} onClick={save} className="mt-5 rounded-lg bg-[#16877d] px-4 py-2 text-sm text-white">{busy?"Saving…":"Save level thresholds"}</button>
    {message&&<p role="status" className="mt-3 text-sm">{message}</p>}
  </section><GiftXpSettings canManage={canManage}/></>;
}
