"use client";
import { useState } from "react";
import TeamSettings from "./team-settings";
import ManagementMembers from "./management-members";
import { MANAGEMENT_ROLE_ORDER, displayApplicationRole } from "@/lib/user-roles";
export default function ManagementTabs(props) {
  const [tab,setTab]=useState("hierarchy"),[data,setData]=useState(null),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  const [from,setFrom]=useState(()=>new Date().toISOString().slice(0,8)+"01");
  const [to,setTo]=useState(()=>new Date().toISOString().slice(0,10)),[role,setRole]=useState("");
  const params=new URLSearchParams({from,to,role});
  async function load(exportFile=false){
    setBusy(true);setError("");
    try{
      const response=await fetch(`/api/admin/management-progress?${params}${exportFile?"&format=csv":""}`,{cache:"no-store"});
      if(!response.ok){const body=await response.json();throw Error(body.error?.message||"Report failed.");}
      if(exportFile){
        const url=URL.createObjectURL(await response.blob()),a=document.createElement("a");a.href=url;a.download=`management-progress-${from}-${to}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      }else setData((await response.json()).data);
    }catch(e){setError(e.message);}finally{setBusy(false);}
  }
  return <section>
    <nav aria-label="Management sections" className="mb-4 flex flex-wrap gap-3">{[["hierarchy","Management Hierarchy"],["targets","Targets & Progress"],["members","Active Members"]].map(([key,label])=><button key={key} onClick={()=>setTab(key)} aria-pressed={tab===key} className={`rounded-lg px-4 py-3 ${tab===key?"bg-teal-700 text-white":"bg-white"}`}>{label}</button>)}</nav>
    {tab==="hierarchy"?<TeamSettings {...props}/>:tab==="members"?<ManagementMembers/>:<div className="rounded-xl bg-white p-5">
      <h3 className="text-lg font-bold">Targets & Progress</h3>
      <p className="my-3 text-sm text-slate-600">Received Diamonds from directly assigned agencies only; reversed gifts excluded. Dates include both days in UTC. Attribution uses current assignments. The current monthly target is shown without prorating; this report does not award salary.</p>
      <div className="flex flex-wrap items-end gap-3">
        <label>From<input className="block rounded border p-2" type="date" value={from} onChange={e=>{setFrom(e.target.value);setData(null);}}/></label>
        <label>Through<input className="block rounded border p-2" type="date" value={to} onChange={e=>{setTo(e.target.value);setData(null);}}/></label>
        <label>Role<select className="block rounded border p-2" value={role} onChange={e=>{setRole(e.target.value);setData(null);}}><option value="">All management roles</option>{MANAGEMENT_ROLE_ORDER.map(r=><option key={r} value={r}>{displayApplicationRole(r)}</option>)}</select></label>
        <button disabled={busy||!props.canManage} className="rounded bg-teal-700 p-2 text-white disabled:opacity-50" onClick={()=>load()}>View report</button>
        <button disabled={busy||!props.canManage} className="rounded border p-2 disabled:opacity-50" onClick={()=>load(true)}>Export CSV (Excel)</button>
      </div>
      {busy&&<p role="status">Preparing report…</p>}{error&&<p role="alert" className="mt-3 text-red-700">{error}</p>}
      {data&&<><p className="my-3">{data.rows.length} members · {data.from} – {data.to} UTC</p><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["Member","Role","Agencies","Received Diamonds","Monthly target","Progress","Status"].map(x=><th className="p-2" key={x}>{x}</th>)}</tr></thead><tbody>{data.rows.map(r=><tr key={r.publicId} className="border-t"><td className="p-2">{r.name}<br/>{r.publicId}</td><td>{displayApplicationRole(r.role)}</td><td>{r.agencyCount}</td><td>{BigInt(r.progressDiamonds).toLocaleString()}</td><td>{r.targetDiamonds?BigInt(r.targetDiamonds).toLocaleString():"Not configured"}</td><td>{r.progressPercent===null?"—":`${r.progressPercent}%`}</td><td>{r.unvaluedGiftCount?`Incomplete: ${r.unvaluedGiftCount} unvalued gifts`:!r.configured?"Not configured":r.achieved?"Achieved":"In progress"}</td></tr>)}</tbody></table>{!data.rows.length&&<p>No members match this role.</p>}</div></>}
    </div>}
  </section>;
}
