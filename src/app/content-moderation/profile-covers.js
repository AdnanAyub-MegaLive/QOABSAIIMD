"use client";
/* eslint-disable @next/next/no-img-element -- authenticated private previews must use the original endpoint */
import { useState } from "react";
import PagedRecords from "../components/paged-records";
export default function ProfileCovers() {
  const [revision,setRevision]=useState(0),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  async function review(item,action) {
    if(action==="DELETE"&&!confirm("Permanently remove this cover photo?"))return;
    setBusy(true);setError("");
    try {const r=await fetch("/api/admin/profile-covers",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:item.userId,coverId:item.id,revision:item.revision,action})});const j=await r.json();if(!r.ok)throw new Error(j.error?.message||"Review failed");setRevision(n=>n+1);}catch(e){setError(e.message);}finally{setBusy(false);}
  }
  return <section className="rounded-2xl border border-[#dfe9e7] bg-white p-5"><h3 className="font-bold">Profile cover review</h3><p className="text-sm text-[#71847f]">Pending photos are visible only to their owner. Browse all gallery or legacy covers. Pending submissions are oldest first.</p>{error&&<p role="alert" className="text-red-600">{error}</p>}<PagedRecords endpoint="/api/admin/profile-covers" revision={revision} filters={[{name:"source",label:"Source",options:["GALLERY","LEGACY"]},{name:"status",label:"Status",options:["PENDING","APPROVED","REJECTED","ALL"]}]}>{items=><><div className="mt-4 grid gap-4 md:grid-cols-3">{items.map(item=><article key={item.id??item.userId} className="rounded-xl border p-3">{item.mimeType==="video/mp4"?<video controls muted preload="metadata" src={`/api/admin/profile-covers?userId=${encodeURIComponent(item.userId)}&coverId=${encodeURIComponent(item.id??"")}&v=${item.revision}`} className="h-32 w-full rounded-lg object-cover"/>:<img alt="Submitted profile cover" src={`/api/admin/profile-covers?userId=${encodeURIComponent(item.userId)}&coverId=${encodeURIComponent(item.id??"")}&v=${item.revision}`} className="h-32 w-full rounded-lg object-cover"/>}<p className="mt-2 font-semibold">{item.user.name}</p><p className="text-xs">{item.user.publicId} · {item.status}</p><div className="mt-3 flex gap-2">{["APPROVE","REJECT","DELETE"].map(action=><button disabled={busy} key={action} onClick={()=>review(item,action)} className="rounded-lg border px-2 py-1 text-xs disabled:opacity-40">{action}</button>)}</div></article>)}</div>{!items.length&&<p className="mt-4 text-sm">No cover photos to review.</p>}</>}</PagedRecords></section>;
}
