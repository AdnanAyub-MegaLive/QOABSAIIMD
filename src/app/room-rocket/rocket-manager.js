'use client';
import { useState } from 'react';

const field = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900';
const groups = { top1: 'TOP 1', top2: 'TOP 2', top3: 'TOP 3', inRoom: 'IN ROOM' };
const defaults = () => ({ enabled: false, title: 'Room Rocket', rules: '', endsAt: new Date(Date.now() + 86400000).toISOString(), repeatDays: 30, resetDelayMinutes: 180, stages: ['50000', '150000', '400000'].map((targetCoins, i) => ({ title: `Rocket LV.${i + 1}`, targetCoins, thumbnailUrl: '', previewUrl: '', mimeType: 'video/mp4', animation: { mediaUrl: '', mimeType: 'video/mp4', lowResolutionMediaUrl: '', posterUrl: '', durationMs: 5000 }, inRoomWinners: 0, rewards: { top1: [], top2: [], top3: [], inRoom: [] } })) });
export default function RocketManager({ initial, enabled, season, assets, canEdit }) {
  const [config, setConfig] = useState(() => ({ ...(initial || defaults()), enabled }));
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  function update(key, value) { setConfig(c => ({ ...c, [key]: value })); }
  function stage(index, key, value) { setConfig(c => ({ ...c, stages: c.stages.map((s, i) => i === index ? { ...s, [key]: value } : s) })); }
  function rewards(index, group, next) { stage(index, 'rewards', { ...config.stages[index].rewards, [group]: next }); }
  async function save(event) {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/admin/room-rocket', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || 'Unable to save.');
      setConfig(body.data); setMessage('Saved. Rules, reset delay and the on/off switch apply now. Existing reset countdowns keep their deadline. Level and reward changes apply to the next season.');
    } catch (error) { setMessage(error.message); } finally { setBusy(false); }
  }
  return <form onSubmit={save} className="space-y-6 text-slate-900">
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">Only future paid gifts count. Existing gifts are never backfilled. Completed launches pay once; earned rewards remain due even if Rocket is switched off. {season && <p className="mt-2">Current season: {season.id} · ends {new Date(season.endsAt).toLocaleString()}</p>}</div>
    <fieldset disabled={!canEdit || busy} className="space-y-6">
      <section className="grid gap-4 rounded-xl border bg-white p-5 md:grid-cols-2">
        <h2 className="md:col-span-2 rounded-xl bg-slate-900 px-4 py-3 text-lg font-bold text-white">Rocket season</h2>
        <label className="flex items-center gap-3 font-semibold"><input type="checkbox" checked={config.enabled} onChange={e => update('enabled', e.target.checked)} />Enable Room Rocket</label>
        <label className="space-y-1 text-sm">Season title<input className={field} required maxLength={100} value={config.title} onChange={e => update('title', e.target.value)} /></label>
        <label className="space-y-1 text-sm">First season end (UTC)<input className={field} type="datetime-local" required value={config.endsAt.slice(0,16)} onChange={e => update('endsAt', e.target.value ? `${e.target.value}:00.000Z` : '')} disabled={Boolean(season)} /><span className="text-xs text-slate-500">After the first season, repeats use the interval below.</span></label>
        <label className="space-y-1 text-sm">Subsequent season length (days)<input className={field} type="number" min={1} max={366} required value={config.repeatDays} onChange={e => update('repeatDays', Number(e.target.value))} /></label>
        <label className="space-y-1 text-sm">Reset after top-level launch (minutes)<input className={field} type="number" min={1} max={10080} required value={config.resetDelayMinutes ?? 180} onChange={e => update('resetDelayMinutes', Number(e.target.value))}/><span className="text-xs text-slate-500">Default: 180 minutes (3 hours). After this wait the room starts again at Level 1. Gifts during this wait do not count. Each earlier launch pauses for 3 minutes; gifts during that pause count toward the next rocket.</span></label>
        <label className="space-y-1 text-sm md:col-span-2">Rules shown in the app<textarea className={field} rows={4} maxLength={10000} value={config.rules} onChange={e => update('rules', e.target.value)} /></label>
      </section>
      {config.stages.map((s, index) => <section key={index} className="space-y-5 rounded-xl border bg-white p-5">
        <header className="rounded-xl bg-slate-900 px-4 py-3 text-white"><p className="text-xs font-semibold uppercase tracking-wider text-cyan-200">Level {index + 1}</p><h2 className="text-lg font-bold">{s.title}</h2></header>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm">Title<input className={field} value={s.title} onChange={e => stage(index, 'title', e.target.value)} /></label>
          <label className="text-sm">Target Coins<input className={field} inputMode="numeric" pattern="[0-9]+" required value={s.targetCoins} onChange={e => stage(index, 'targetCoins', e.target.value)} /></label>
          {['thumbnailUrl','previewUrl'].map(key => <label key={key} className="text-sm">{key === 'thumbnailUrl' ? 'Rocket picture URL (HTTPS)' : 'Preview video / SVGA URL (optional)'}<input className={field} type="url" value={s[key] || ''} onChange={e => stage(index, key, e.target.value)} /></label>)}
          <label className="text-sm">Preview format<select className={field} value={s.mimeType} onChange={e => stage(index, 'mimeType', e.target.value)}><option>video/mp4</option><option>application/svga</option></select></label>
          {['mediaUrl','lowResolutionMediaUrl','posterUrl'].map(key => <label key={key} className="text-sm">{({ mediaUrl: 'Launch animation URL', lowResolutionMediaUrl: 'Low-quality launch URL (optional)', posterUrl: 'Launch poster URL (optional)' })[key]}<input className={field} type="url" value={s.animation[key] || ''} onChange={e => stage(index, 'animation', { ...s.animation, [key]: e.target.value })} /></label>)}
          <label className="text-sm">Launch format<select className={field} value={s.animation.mimeType} onChange={e => stage(index, 'animation', { ...s.animation, mimeType: e.target.value })}><option>video/mp4</option><option>application/svga</option></select></label>
          <label className="text-sm">Launch duration (milliseconds)<input className={field} type="number" min={100} max={120000} value={s.animation.durationMs} onChange={e => stage(index, 'animation', { ...s.animation, durationMs: Number(e.target.value) })} /></label>
          <label className="text-sm">IN ROOM winners<input className={field} type="number" min={0} max={100} value={s.inRoomWinners} onChange={e => stage(index, 'inRoomWinners', Number(e.target.value))} /></label>
        </div>
        <p className="text-xs text-slate-500">Use stable uploaded/CDN media URLs, not expiring preview links. TOP 1–3 are excluded from the random IN ROOM draw; each selected person gets the bundle below once.</p>
        <div className="grid gap-4 lg:grid-cols-2">{Object.entries(groups).map(([group, label]) => <div key={group} className="space-y-3 rounded-lg border bg-slate-50 p-4">
          <h3 className="font-semibold">{label} rewards</h3>
          {s.rewards[group].map((r, n) => <div key={n} className="space-y-2 rounded border bg-white p-3">
            <select aria-label={`${label} reward type`} className={field} value={r.type} onChange={e => rewards(index, group, s.rewards[group].map((v,j) => j === n ? { type: e.target.value, amount: '1', assetId: '' } : v))}><option value="COINS">Coins</option><option value="PROP">Store prop (days)</option><option value="GIFT">Backpack gift (quantity)</option></select>
            {r.type !== 'COINS' && <select aria-label="Reward asset" className={field} required value={r.assetId} onChange={e => rewards(index, group, s.rewards[group].map((v,j) => j === n ? { ...v, assetId: e.target.value } : v))}><option value="">Choose an uploaded asset</option>{assets.filter(a => r.type === 'GIFT' ? a.category === 'GIFTS' : ['FRAMES','RIDES','BADGES','PROFILE_DRESS','USER_TAGS','PROFILE_BG','ENTRANCES','TAIL_LIGHTS','CHAT_BOXES','ROOM_FRAMES','ROOM_BACKGROUNDS','SEAT_STYLES','BUSINESS_CARD'].includes(a.category)).map(a => <option key={a.publicId} value={a.publicId}>{a.name} · {a.category}</option>)}</select>}
            <label className="text-xs">{r.type === 'COINS' ? 'Coins' : r.type === 'PROP' ? 'Days' : 'Quantity'}<input className={field} inputMode="numeric" pattern="[0-9]+" required value={r.amount} onChange={e => rewards(index, group, s.rewards[group].map((v,j) => j === n ? { ...v, amount: e.target.value } : v))} /></label>
            <button type="button" className="text-sm font-medium text-red-700" onClick={() => rewards(index, group, s.rewards[group].filter((_,j) => j !== n))}>Remove reward</button>
          </div>)}
          <button type="button" disabled={s.rewards[group].length >= 10} className="rounded-lg border border-teal-700 px-3 py-2 text-sm font-semibold text-teal-800" onClick={() => rewards(index, group, [...s.rewards[group], { type: 'COINS', amount: '1' }])}>Add reward</button>
        </div>)}</div>
      </section>)}
      <button type="submit" className="rounded-lg bg-teal-800 px-5 py-3 font-semibold text-white">{busy ? 'Saving…' : 'Save Rocket settings'}</button>
    </fieldset>
    {message && <p role="status" className="rounded-lg border bg-white p-4 text-sm">{message}</p>}
  </form>;
}
