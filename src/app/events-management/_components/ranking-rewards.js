'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function RankingRewards({events,policies,rounds,assets,tiers,canEdit}) {
  const router=useRouter();
  const initial=policies.find(p=>p.track==='wealth'&&p.period==='today');
  const [track,setTrack]=useState('wealth'),[period,setPeriod]=useState('today'),[enabled,setEnabled]=useState(initial?.enabled??false),[rows,setRows]=useState(initial?.rewards??[]),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const select=(t,p)=>{setTrack(t);setPeriod(p);const policy=policies.find(x=>x.track===t&&x.period===p);setEnabled(policy?.enabled??false);setRows(policy?.rewards??[]);};
  const update=(i,data)=>setRows(rows.map((r,j)=>i===j?{...r,...data}:r));
  const send=async(url,data)=>{setBusy(true);setMessage('');try{const csrf=decodeURIComponent(document.cookie.split('; ').find(p=>p.startsWith('streamline_events_csrf='))?.split('=')[1]||'');const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','x-events-csrf':csrf},body:JSON.stringify(data)});const result=await response.json();if(!response.ok)throw Error(result.error?.message||'Unable to save.');setMessage(result.data?.policy?`Saved. Effective ${new Date(result.data.policy.effectiveFrom).toUTCString()}.`:'Done.');router.refresh();}catch(e){setMessage(e.message);}finally{setBusy(false);}};
  const field='rounded-lg border border-slate-300 bg-white p-2 text-slate-900';
  return <section className="my-6 rounded-2xl border border-slate-200 bg-white p-6 text-slate-900">
    <h3 className="text-xl font-bold">Ranking events & automatic rewards</h3>
    <p className="my-2 text-sm text-slate-600">Daily, Monday-based Weekly and Monthly periods use UTC. Changes start next full period, never past periods. Each CP partner receives the full reward; agency rewards go to its owner. Equal scores use public ID order.</p>
    <div className="my-4 flex flex-wrap gap-3">{['wealth','charm','agency','cp'].map(t=><button key={t} disabled={busy||events.includes(`ranking-${t}`)} className={field} onClick={()=>send(`/api/events/rankings-template?track=${t}`,{})}>{events.includes(`ranking-${t}`)?'Created':'Create'} {t} event</button>)}</div>
    {canEdit&&<fieldset disabled={busy}>
      <div className="flex flex-wrap gap-3"><label>Event <select className={field} value={track} onChange={e=>select(e.target.value,period)}>{['wealth','charm','agency','cp'].map(t=><option key={t}>{t}</option>)}</select></label><label>Period <select className={field} value={period} onChange={e=>select(track,e.target.value)}><option value="today">Daily</option><option value="week">Weekly</option><option value="month">Monthly</option></select></label><label className="p-2"><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/> Enable future awards</label><button className={field} onClick={()=>select(track,period)}>Load saved settings</button></div>
      {rows.map((r,i)=><div key={i} className="my-3 rounded-xl bg-slate-50 p-4">
        <div className="flex flex-wrap gap-3"><label>Rank <input className={field} type="number" min="1" max="20" value={r.rank} onChange={e=>update(i,{rank:Number(e.target.value)})}/></label><label>Coins <input className={field} inputMode="numeric" value={r.coins} onChange={e=>update(i,{coins:e.target.value})}/></label><label>Diamonds <input className={field} inputMode="numeric" value={r.diamonds} onChange={e=>update(i,{diamonds:e.target.value})}/></label><button onClick={()=>setRows(rows.filter((_,j)=>i!==j))}>Remove rank</button></div>
        <div className="mt-3 flex flex-wrap gap-3"><label>VIP reward <select className={field} value={r.vip?.tierId||''} onChange={e=>update(i,{vip:e.target.value?{tierId:e.target.value,days:r.vip?.days??7}:null})}><option value="">None</option>{tiers.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>{r.vip&&<label>VIP days <input className={field} type="number" min="1" max="365" value={r.vip.days} onChange={e=>update(i,{vip:{...r.vip,days:Number(e.target.value)}})}/></label>}</div>
        {r.props.map((p,j)=><div key={j} className="mt-3 flex gap-3"><select aria-label="Reward prop" className={field} value={p.assetId} onChange={e=>update(i,{props:r.props.map((x,k)=>j===k?{...x,assetId:e.target.value}:x)})}><option value="">Choose prop</option>{assets.map(a=><option key={a.id} value={a.id}>{a.category}: {a.name}</option>)}</select><label>Days <input className={field} type="number" min="1" max="365" value={p.days} onChange={e=>update(i,{props:r.props.map((x,k)=>j===k?{...x,days:Number(e.target.value)}:x)})}/></label><button onClick={()=>update(i,{props:r.props.filter((_,k)=>j!==k)})}>Remove prop</button></div>)}
        <button className="mt-3 text-violet-700" onClick={()=>update(i,{props:[...r.props,{assetId:'',days:7}]})}>+ Add prop</button>
      </div>)}
      <div className="mt-4 flex gap-3"><button className={field} disabled={rows.length>=20} onClick={()=>setRows([...rows,{rank:rows.length+1,coins:'0',diamonds:'0',props:[],vip:null}])}>Add rank reward</button><button className="rounded-lg bg-violet-800 p-3 text-white" onClick={()=>send('/api/events/ranking-rewards',{track,period,enabled,rewards:rows})}>Save future settings</button></div>
    </fieldset>}
    <p role="status" className="my-3">{message}</p>
    <h4 className="mt-5 font-bold">Latest reward rounds</h4>
    <p className="text-sm text-slate-600">Failed rounds are held without partial awards. Resolve the cause before retrying. Unpublishing prevents payouts while the event is unavailable.</p>
    {rounds.length===0?<p className="mt-2">No completed periods yet.</p>:rounds.map(r=><div key={r.id} className="my-2 rounded-lg border p-3 text-sm"><b>{r.eventSlug} · {r.period} · {r.status}</b><p>{new Date(r.startsAt).toUTCString()} — {new Date(r.endsAt).toUTCString()}</p><p>{r.error}</p><details><summary>Frozen winners and recipients</summary>{r.winners.map(w=><p key={w.rank}>#{w.rank} · {w.id} · {w.score} Coins · Accounts: {w.recipients.join(', ')}</p>)}</details>{canEdit&&r.status==='REVIEW'&&<button disabled={busy} className={field} onClick={()=>{if(window.confirm('Authorize retry for these frozen winners? All eligibility checks will still apply.'))send('/api/events/ranking-rewards',{retryRoundId:r.id});}}>Retry held round</button>}</div>)}
  </section>;
}
