"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
const fields = track => track === "SUPPORTER" ? [["backgroundAssetId","Background"],["top1MedalAssetId","TOP 1 medal"],["top2MedalAssetId","TOP 2 medal"],["top3MedalAssetId","TOP 3 medal"]] : [["backgroundAssetId","Background"],["badgeAssetId","Medal"]];
function AssetPreview({ id }) {
 const [state,setState]=useState(null);
 useEffect(()=>{if(!id)return;const controller=new AbortController();const timer=setTimeout(()=>{fetch(`/api/admin/profile-card-artwork?${new URLSearchParams({assetId:id})}`,{signal:controller.signal,cache:"no-store"}).then(async r=>{const j=await r.json();if(!r.ok)throw Error(j.error?.message);return j.data.previews[id]??null;}).then(media=>{if(!controller.signal.aborted)setState({id,media});}).catch(()=>{if(!controller.signal.aborted)setState({id,media:null});});},350);return()=>{clearTimeout(timer);controller.abort();};},[id]);
 if(!id)return null;
 if(state?.id!==id)return <p className="text-xs">Loading preview…</p>;
 const media=state.media;
 if(!media)return <p className="text-xs">No active public asset found.</p>;
 if(media.mimeType==="video/mp4")return <video className="h-20 max-w-full" src={media.url} muted loop autoPlay playsInline controls/>;
 if(media.mimeType==="application/svga")return <div>{media.posterUrl&&<img className="h-20 max-w-full object-contain" src={media.posterUrl} alt="SVGA poster"/>}<a href={media.url} target="_blank" rel="noreferrer" className="text-xs underline">SVGA {media.posterUrl?"poster":"asset (no poster)"}</a></div>;
 return <img className="h-20 max-w-full object-contain" src={media.url} alt="Selected artwork"/>;
}
function ArtworkUpload({ label, disabled, onSelect, onBusy }) {
 const [error,setError]=useState("");
 async function upload(event) {
  const file=event.target.files?.[0]; if(!file)return;
  setError("");onBusy(true);
  try {
   const form=new FormData();form.set("name",label);form.set("category","AGENCY_ARTWORK");form.set("distribution","FREE");form.set("storeVisible","false");form.set("file",file);
   const response=await fetch("/api/uploads",{method:"POST",body:form});const body=await response.json();
   if(!response.ok||!body.success)throw Error(body.error?.message||"Upload failed.");
   onSelect(body.data.asset.id);
  } catch(e){setError(e.message);}finally{onBusy(false);event.target.value="";}
 }
 return <div><input aria-label={`Upload ${label}`} type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={disabled} onChange={upload} className="my-2 block w-full text-xs"/>{error&&<p role="alert" className="text-red-600">{error}</p>}</div>;
}
function withAgencyLevels(data){return {...data,ranges:[...data.ranges.filter(r=>r.track!=="AGENCY"),...Array.from({length:50},(_,i)=>{const level=i+1,old=data.ranges.find(r=>r.track==="AGENCY"&&level>=r.min&&(r.max==null||level<=r.max));return {track:"AGENCY",min:level,max:level,backgroundAssetId:old?.backgroundAssetId??null,badgeAssetId:old?.badgeAssetId??null};})]};}
export default function CardArtworkSettings({canManage=false,canUpload=false}){
 const [data,setData]=useState(null),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 useEffect(()=>{fetch("/api/admin/profile-card-artwork").then(async r=>{const j=await r.json();if(!r.ok)throw new Error(j.error?.message);setData(withAgencyLevels(j.data));}).catch(e=>setError(e.message));},[]);
 const edit=(i,key,value)=>setData(d=>({...d,ranges:d.ranges.map((r,n)=>i===n?{...r,[key]:value}:r)}));
 async function save(){setBusy(true);setError("");try{const r=await fetch("/api/admin/profile-card-artwork",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({revision:data.revision,ranges:data.ranges})}),j=await r.json();if(!r.ok)throw new Error(j.error?.message);setData(withAgencyLevels(j.data));}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <section className="my-6 rounded-2xl border bg-white p-5"><h3 className="text-lg font-bold">Profile card artwork</h3><p className="my-2 text-sm">Supporter uses the profile owner&apos;s Charm level; Agency uses Agency level. Agency levels 1–50 each have their own badge and background. Upload directly below or enter a global AST ID. Remove level artwork clears both images without changing earned XP or level thresholds. Save artwork to apply changes. Backgrounds: approximately 1200×600 (Supporter), 1200×375 (Agency). Medals: square with transparent centre. MP4 backgrounds play muted. Blank maximum means open-ended; ranges cannot overlap.</p>{error&&<p role="alert" className="text-red-600">{error}</p>}
 {data?.ranges.map((r,i)=><details open={r.track==="SUPPORTER"} key={i}><summary className="cursor-pointer rounded border p-3 font-semibold">{r.track==="AGENCY"?`Agency level ${r.min} — ${r.badgeAssetId||r.backgroundAssetId?"Configured":"Empty"}`:"Supporter artwork"}</summary><div key={i} className="my-3 grid gap-3 rounded-xl border p-3 sm:grid-cols-2 lg:grid-cols-4">
 <fieldset disabled={!canManage||busy} className="contents"><label>Card<select disabled={r.track==="AGENCY"} className="block rounded border p-2" value={r.track} onChange={e=>edit(i,"track",e.target.value)}><option value="SUPPORTER">Supporter</option><option value="AGENCY">Agency</option></select></label>
 {["min","max"].map(k=><label key={k} className="text-xs">{r.track==="SUPPORTER"?"Charm":"Agency"} level {k==="min"?"from":"to"}<input className="block w-full rounded border p-2" type="number" disabled={r.track==="AGENCY"} min="0" value={r[k]??""} onChange={e=>edit(i,k,e.target.value===""?null:Number(e.target.value))}/></label>)}
 <button type="button" onClick={()=>setData(d=>({...d,ranges:r.track==="AGENCY"?d.ranges.map((x,n)=>n===i?{...x,backgroundAssetId:null,badgeAssetId:null}:x):d.ranges.filter((_,n)=>n!==i)}))}>{r.track==="AGENCY"?"Remove level artwork":"Remove range"}</button>
 {fields(r.track).map(([key,label])=><label key={key} className="text-xs">{label}<input className="mb-2 block w-full rounded border p-2" value={r[key]??""} placeholder="AST-…" onChange={e=>edit(i,key,e.target.value||null)}/><AssetPreview id={r[key]}/>{r.track==="AGENCY"&&<ArtworkUpload label={`Agency level ${r.min} ${label}`} disabled={!canManage||!canUpload||busy} onBusy={setBusy} onSelect={id=>edit(i,key,id)}/>}<button type="button" onClick={()=>edit(i,key,null)}>Remove {label.toLowerCase()}</button></label>)}
 </fieldset></div></details>)}
 <div className="flex gap-3"><button disabled={!data||busy||!canManage} className="rounded border px-3 py-2" onClick={()=>setData(d=>({...d,ranges:[...d.ranges,{track:"SUPPORTER",min:0,max:null,backgroundAssetId:null,top1MedalAssetId:null,top2MedalAssetId:null,top3MedalAssetId:null}]}))}>Add range</button><button disabled={!data||busy||!canManage} className="rounded bg-teal-700 px-4 py-2 text-white" onClick={save}>Save artwork</button></div></section>;
}
