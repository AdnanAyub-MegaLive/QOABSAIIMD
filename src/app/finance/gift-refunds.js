"use client";
import { useState } from "react";
export default function GiftRefunds({canRefund}) {
  const [id,setId]=useState(""),[preview,setPreview]=useState(null),[reason,setReason]=useState(""),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[rows,setRows]=useState([]);
  async function request(url,options){const response=await fetch(url,options);const result=await response.json();if(!response.ok||!result.success)throw new Error(result.error?.message??"Request failed");return result.data;}
  async function run(action){setBusy(true);setMessage("");try{await action();}catch(e){setMessage(e.message);}finally{setBusy(false);}}
  const input="rounded-lg border border-[#dce7e4] p-3 text-sm";
  return <div className="space-y-4 rounded-xl border border-[#dce7e4] bg-white p-5">
    <h2 className="font-bold text-[#183f3b]">Gift refunds & manual review</h2>
    <p className="text-sm text-[#71847f]">Preview first. All rewards must be recoverable. Historical gifts without recovery records, live/PK outcomes and claimed task rewards require manual review. No partial recovery or negative balances.</p>
    <form className="flex gap-3" onSubmit={e=>{e.preventDefault();setPreview(null);run(async()=>setPreview(await request(`/api/admin/gift-refunds?giftId=${encodeURIComponent(id.trim())}`)));}}>
      <input aria-label="Gift transaction ID" className={`${input} flex-1`} required value={id} onChange={e=>{setId(e.target.value);setPreview(null);}} placeholder="Gift transaction ID"/>
      <button disabled={busy} className="rounded-lg bg-[#087f74] px-4 text-white disabled:opacity-50">Preview</button>
    </form>
    {preview&&<section className="space-y-3 rounded-lg bg-[#f3f8f6] p-4">
      <p className="font-semibold">{preview.giftId} — {preview.status}</p>
      {preview.manualReason&&<p className="text-sm text-amber-800">{preview.manualReason}</p>}
      {preview.plan&&<dl className="grid grid-cols-2 gap-2 text-sm">{Object.entries({"Refund method":preview.plan.source,"Coins":preview.plan.coins,"Recipient Diamonds to recover":preview.plan.diamonds,"Agency Coins to recover":preview.plan.agencyCoins,"Lucky Coins to recover":preview.plan.luckyCoins,"Backpack / reward quantity":preview.plan.quantity,"Blind-box reward asset":preview.plan.rewardAssetId??"None"}).map(([label,value])=><div key={label}><dt className="text-[#71847f]">{label}</dt><dd>{String(value??"Unknown")}</dd></div>)}</dl>}
      {canRefund&&preview.status==="NOT_REQUESTED"&&!preview.alreadyReversed&&<form className="flex gap-3" onSubmit={e=>{e.preventDefault();run(async()=>{const data=await request("/api/admin/gift-refunds",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({giftId:preview.giftId,confirmation:preview.confirmation,reason})});setMessage(`${data.status}${data.reviewReason?`: ${data.reviewReason}`:""}`);setPreview({...preview,status:data.status});});}}>
        <input aria-label="Refund reason" required maxLength={500} className={`${input} flex-1`} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Reason for refund"/>
        <button disabled={busy} className="rounded-lg bg-[#183f3b] px-4 text-white disabled:opacity-50">{preview.manualReason?"Send for review":"Confirm recovery & refund"}</button>
      </form>}
    </section>}
    <p role="status" className="text-sm">{message}</p>
    <button disabled={busy} className={input} onClick={()=>run(async()=>setRows(await request("/api/admin/gift-refunds")))}>Load recent refunds / review queue</button>
    {rows.map(row=><article key={row.giftId} className="rounded-lg border p-3 text-sm"><strong>{row.giftId} — {row.status}</strong><p>{row.reason}</p><p>{row.reviewReason}</p><time>{row.createdAt}</time></article>)}
  </div>;
}
