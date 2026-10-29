"use client";
import { useState } from 'react';
export default function NewUserRewardsManager({ initialPolicy, assets, tiers }) {
  const [policy, setPolicy] = useState(initialPolicy);
  const [enabled, setEnabled] = useState(initialPolicy?.enabled ?? false);
  const [rewards, setRewards] = useState(initialPolicy?.rewards ?? Array.from({ length: 7 }, () => ({ kind: 'COINS', coins: '0' })));
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const change = (i, value) => setRewards(rows => rows.map((r, n) => n === i ? value : r));
  async function save() {
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/admin/new-user-rewards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled, rewards, revision: policy?.id ?? 0 }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || 'Save failed.');
      setPolicy(result.data); setMessage('Saved for future registrations only. Existing accounts and ongoing reward schedules are unchanged.');
    } catch (error) { setMessage(error.message); } finally { setBusy(false); }
  }
  return <section className="mb-8 rounded-xl border p-5">
    <h2 className="text-xl font-bold">New-user 7-day login rewards</h2>
    <p>Separate from daily check-in. Each day is 24 hours from account creation. Missed days are lost; all claims expire after 168 hours.</p>
    <p>Publishing changes applies only to accounts created afterward. Disabling stops eligibility for future registrations; already eligible accounts retain their original schedule.</p>
    <fieldset disabled={busy}>
      <label><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} /> Enable for future new accounts</label>
      {rewards.map((reward, i) => <div key={i} className="my-3 flex flex-wrap items-center gap-3">
        <strong>Day {i + 1}</strong>
        <select aria-label={`Day ${i + 1} reward type`} value={reward.kind} onChange={e => change(i, e.target.value === 'COINS' ? { kind: 'COINS', coins: '0' } : { kind: e.target.value, id: '', days: 7 })}>
          <option value="COINS">Coins</option><option value="PROP">Prop (frame, ride, etc.)</option><option value="VIP">VIP</option>
        </select>
        {reward.kind === 'COINS' ? <input aria-label={`Day ${i + 1} Coins`} type="number" min="0" max="1000000000" value={reward.coins} onChange={e => change(i, { ...reward, coins: e.target.value })} /> : <>
          <select aria-label={`Day ${i + 1} item`} value={reward.id} onChange={e => change(i, { ...reward, id: e.target.value })}><option value="">Select reward</option>
            {(reward.kind === 'VIP' ? tiers : assets).map(a => <option key={a.id ?? a.publicId} value={a.id ?? a.publicId}>{a.name}{a.category ? ` (${a.category})` : ''}</option>)}
          </select>
          <label>Duration (days) <input type="number" min="1" max="365" value={reward.days} onChange={e => change(i, { ...reward, days: Number(e.target.value) })} /></label>
        </>}
      </div>)}
      <button type="button" onClick={save} className="rounded bg-emerald-700 px-4 py-2 text-white">{busy ? 'Saving…' : 'Publish for future accounts'}</button>
    </fieldset>
    <p role="status">{message}</p>
  </section>;
}
