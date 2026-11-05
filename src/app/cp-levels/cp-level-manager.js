'use client';
import { useState } from 'react';
import CpMediaUpload from './cp-media-upload';

const blankLevel = level => ({ level, name: '', minExp: '0', enabled: false, badgeUrl: '', fullAnimationUrl: '', fullAnimationMimeType: 'application/svga', seatEffect: 'WAVE_1', seatColor: '', rewards: [] });
export default function CpLevelManager({ initial, assets, canEdit }) {
  const [levels, setLevels] = useState(initial);
  const [form, setForm] = useState(initial[0] ?? blankLevel(1));
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const update = (key, value) => setForm(previous => ({ ...previous, [key]: value }));
  const rewardUpdate = (index, key, value) => update('rewards', form.rewards.map((row, i) => i === index ? { ...row, [key]: value } : row));
  const field = 'block w-full rounded-lg border border-slate-300 bg-white p-2 text-sm';
  async function save(event) {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/admin/cp-levels', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const result = await response.json();
      if (!response.ok) throw Error(result.error?.message ?? 'Unable to save CP level.');
      setLevels(previous => [...previous.filter(row => row.level !== result.data.level.level), result.data.level].sort((a,b) => a.level-b.level));
      setForm(result.data.level); setMessage('Saved. CP levels and eligible rewards have been updated.');
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }
  return <section className="rounded-2xl border border-slate-200 bg-white p-6">
    <h2 className="text-xl font-bold">CP levels, effects and rewards</h2>
    <p className="my-3 text-sm text-slate-600">Enabled levels apply immediately. Each couple earns each level’s rewards once for both partners. Lowering a threshold can grant rewards to existing couples.</p>
    <div className="my-4 flex flex-wrap gap-2">{levels.map(row => <button disabled={busy} key={row.level} className="rounded-lg border px-3 py-2" onClick={() => setForm(row)}>Level {row.level} · {row.name}{row.enabled ? '' : ' (disabled)'}</button>)}{canEdit && <button disabled={busy} className="rounded-lg border px-3 py-2" onClick={() => setForm(blankLevel(Math.max(0,...levels.map(row=>row.level))+1))}>Add level</button>}</div>
    <form onSubmit={save}><fieldset disabled={!canEdit || busy}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label>Level<input className={field} type="number" min="1" value={form.level} disabled /></label>
        <label>Name<input className={field} maxLength={100} required value={form.name} onChange={e=>update('name',e.target.value)} /></label>
        <label>Coins needed<input className={field} inputMode="numeric" pattern="[0-9]+" required value={form.minExp} onChange={e=>update('minExp',e.target.value)} /></label>
        <CpMediaUpload label="Badge image" value={form.badgeUrl} onBusy={setBusy} onMessage={setMessage} onUploaded={({url})=>update('badgeUrl',url)} onRemove={()=>update('badgeUrl',null)} />
        <CpMediaUpload label="Full-screen animation" animation value={form.fullAnimationUrl} onBusy={setBusy} onMessage={setMessage} onUploaded={({url,mimeType})=>setForm(previous=>({...previous,fullAnimationUrl:url,fullAnimationMimeType:mimeType}))} onRemove={()=>setForm(previous=>({...previous,fullAnimationUrl:null,fullAnimationMimeType:null}))} />
        <label>Seat effect<select className={field} value={form.seatEffect} onChange={e=>update('seatEffect',e.target.value)}>{[1,2,3,4,5].map(n=><option key={n}>WAVE_{n}</option>)}</select></label>
        <label>Seat color override<input className={field} placeholder="#FF66AA" value={form.seatColor ?? ''} onChange={e=>update('seatColor',e.target.value)} /></label>
      </div>
      <label className="my-4 flex items-center gap-2"><input type="checkbox" checked={form.enabled} onChange={e=>update('enabled',e.target.checked)} />Enabled</label>
      <h3 className="font-bold">Rewards for each partner</h3>
      {form.rewards.map((reward,index)=><div key={index} className="my-3 grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
        <label>Kind<select className={field} value={reward.kind} onChange={e=>update('rewards',form.rewards.map((row,i)=>i===index?{kind:e.target.value,name:row.name,imageUrl:row.imageUrl}:row))}>{['FRAME','ENTRANCE','BADGE','COINS','ITEM'].map(kind=><option key={kind}>{kind}</option>)}</select></label>
        <label>Reward name<input className={field} required value={reward.name} onChange={e=>rewardUpdate(index,'name',e.target.value)} /></label>
        {reward.kind!=='COINS' && <label>Uploaded item<select className={field} required value={reward.itemId ?? ''} onChange={e=>rewardUpdate(index,'itemId',e.target.value)}><option value="">Choose item</option>{assets.filter(asset=>({FRAME:['FRAMES'],ENTRANCE:['ENTRANCES'],BADGE:['BADGES'],ITEM:['GIFTS','LIVE_GIFTS']}[reward.kind]??[]).includes(asset.category)).map(asset=><option key={asset.publicId} value={asset.publicId}>{asset.name}</option>)}</select></label>}
        {['COINS','ITEM'].includes(reward.kind) ? <label>Amount<input className={field} inputMode="numeric" required value={reward.amount ?? ''} onChange={e=>rewardUpdate(index,'amount',e.target.value)} /></label> : <label>Days<input className={field} type="number" min="1" max="3650" required value={reward.days ?? ''} onChange={e=>rewardUpdate(index,'days',e.target.value)} /></label>}
        <CpMediaUpload label="Reward image" value={reward.imageUrl} onBusy={setBusy} onMessage={setMessage} onUploaded={({url})=>rewardUpdate(index,'imageUrl',url)} onRemove={()=>rewardUpdate(index,'imageUrl',null)} />
        <button type="button" onClick={()=>update('rewards',form.rewards.filter((_,i)=>i!==index))}>Remove reward</button>
      </div>)}
      <div className="mt-4 flex gap-3"><button type="button" className="rounded-lg border px-4 py-2" disabled={form.rewards.length>=20} onClick={()=>update('rewards',[...form.rewards,{kind:'COINS',name:'',amount:'',imageUrl:''}])}>Add reward</button><button className="rounded-lg bg-teal-800 px-4 py-2 text-white" disabled={busy}>{busy?'Saving…':'Save level'}</button></div>
    </fieldset></form><p role="status" className="mt-3 text-sm">{message}</p>
  </section>;
}
