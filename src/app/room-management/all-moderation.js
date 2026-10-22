"use client";
import {useEffect,useState} from 'react';
import {PermissionButton} from '../components/portal-access';
export default function AllModeration(){
 const [filters,setFilters]=useState({type:'ALL',status:'ALL',q:'',from:'',to:''}),[page,setPage]=useState(1),[data,setData]=useState(null),[error,setError]=useState(''),[revision,setRevision]=useState(0),[busy,setBusy]=useState(false);
 useEffect(()=>{
  const controller=new AbortController();
  const timer=setTimeout(()=>{setData(null);setError('');fetch(`/api/admin/room-management/moderation?${new URLSearchParams({...filters,page:String(page)})}`,{signal:controller.signal,cache:'no-store'}).then(async r=>{const b=await r.json();if(!r.ok)throw Error(b.error?.message||'Unable to load moderation.');setData(b.data);}).catch(e=>{if(e.name!=='AbortError')setError(e.message);});},200);
  return()=>{clearTimeout(timer);controller.abort();};
 },[filters,page,revision]);
 function change(key,value){setPage(1);setData(null);setFilters(f=>({...f,[key]:value}));}
 async function unban(row){
  if(!window.confirm(`Lift the ban for ${row.target.publicId} in ${row.room.roomId}?`))return;
  setBusy(true);setError('');try{const r=await fetch(`/api/admin/room-management?banId=${encodeURIComponent(row.banId)}`,{method:'DELETE'});const b=await r.json();if(!r.ok)throw Error(b.error?.message||'Unban failed.');setRevision(v=>v+1);}catch(e){setError(e.message);}finally{setBusy(false);}
 }
 return <section className="my-6 rounded-2xl border bg-white p-5">
  <h2 className="text-xl font-bold">All rooms · Bans and kicks</h2>
  <p className="text-sm text-gray-600">Historical actions are retained. Kicks and unbans are completed actions; status filters apply to bans. Dates use UTC.</p>
  <div className="my-4 flex flex-wrap gap-3">
   <label>Type <select aria-label="Moderation type" value={filters.type} onChange={e=>change('type',e.target.value)}>{['ALL','KICK','BAN','SEAT_KICK'].map(v=><option key={v}>{v}</option>)}</select></label>
   <label>Status <select aria-label="Ban status" value={filters.status} onChange={e=>change('status',e.target.value)}>{['ALL','ACTIVE','EXPIRED','REVOKED'].map(v=><option key={v}>{v}</option>)}</select></label>
   <input aria-label="Search moderation" placeholder="User name/ID or room title/ID" value={filters.q} onChange={e=>change('q',e.target.value)} className="rounded border p-2"/>
   <label>From <input type="date" value={filters.from} onChange={e=>change('from',e.target.value)}/></label>
   <label>To <input type="date" value={filters.to} onChange={e=>change('to',e.target.value)}/></label>
  </div>
  {error&&<p role="alert" className="text-red-700">{error}</p>}
  {!data&&!error?<p>Loading moderation…</p>:<div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['Action','Room','User','Actor','Reason','Duration / expiry','Created','Status',''].map((v,i)=><th key={i} className="p-2">{v}</th>)}</tr></thead><tbody>{data?.items.map(r=><tr key={`${r.id}-${r.banId||''}`} className="border-t"><td className="p-2">{r.action}</td><td>{r.room.title}<br/>{r.room.roomId}</td><td>{r.target.name}<br/>{r.target.publicId}</td><td>{r.actor.name}<br/>{r.actor.adminId?'Portal Admin':r.actor.publicId}</td><td className="max-w-xs whitespace-pre-wrap break-words">{r.reason||'—'}</td><td>{r.durationMinutes===0?'Permanent':r.durationMinutes==null?'—':`${r.durationMinutes} min`}<br/>{r.expiresAt?new Date(r.expiresAt).toLocaleString():'—'}</td><td>{new Date(r.createdAt).toLocaleString()}</td><td>{r.status}</td><td>{r.status==='ACTIVE'&&r.banId&&<PermissionButton permission="rooms.manage" disabled={busy} onClick={()=>unban(r)} className="rounded border p-2">Unban</PermissionButton>}</td></tr>)}</tbody></table>{data&&!data.items.length&&<p>No matching actions.</p>}</div>}
  <div className="mt-4 flex gap-4"><button disabled={page===1||busy} onClick={()=>{setData(null);setPage(p=>p-1);}}>Previous</button><span>Page {page}</span><button disabled={!data?.hasMore||busy} onClick={()=>{setData(null);setPage(p=>p+1);}}>Next</button></div>
 </section>;
}
