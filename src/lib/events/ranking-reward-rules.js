import { eventRankingTypes, rankingWindow } from './ranking-contract.js';

export function rewardInput(input, now = new Date()) {
  if (!eventRankingTypes.includes(input.track) || !['today', 'week', 'month'].includes(input.period) || typeof input.enabled !== 'boolean') throw new Error('Choose a ranking, period and enabled state.');
  if (!Array.isArray(input.rewards) || input.rewards.length > 20 || (input.enabled && !input.rewards.length)) throw new Error('Configure rewards for up to 20 ranks.');
  const ranks = new Set();
  const rewards = input.rewards.map(row => {
    if (!Number.isInteger(row.rank) || row.rank < 1 || row.rank > 20 || ranks.has(row.rank)) throw new Error('Ranks must be unique, between 1 and 20.');
    ranks.add(row.rank);
    const amount = value => { const text = String(value ?? '0'); if (!/^\d{1,15}$/.test(text)) throw new Error('Amounts must be non-negative whole numbers (up to 15 digits).'); return BigInt(text).toString(); };
    const days = value => { if (!Number.isInteger(value) || value < 1 || value > 365) throw new Error('Reward duration must be 1–365 days.'); return value; };
    const id = value => { if (typeof value !== 'string' || !value || value.length > 100) throw new Error('Choose a valid reward item.'); return value; };
    if (!Array.isArray(row.props ?? []) || (row.props ?? []).length > 10) throw new Error('At most 10 props per rank.');
    const props = (row.props ?? []).map(p => ({ assetId: id(p.assetId), days: days(p.days) }));
    if (new Set(props.map(p => p.assetId)).size !== props.length) throw new Error('A prop may appear only once per rank.');
    const result = { rank: row.rank, coins: amount(row.coins), diamonds: amount(row.diamonds), props, vip: row.vip ? { tierId: id(row.vip.tierId), days: days(row.vip.days) } : null };
    if (result.coins === '0' && result.diamonds === '0' && !props.length && !result.vip) throw new Error('Each rank needs at least one reward.');
    return result;
  }).sort((a, b) => a.rank - b.rank);
  return { track: input.track, period: input.period, enabled: input.enabled, eventSlug: `ranking-${input.track}`, effectiveFrom: rankingWindow(input.period, now).end, rewards };
}

export function policyFor(policies, start) {
  return policies.filter(p => p.effectiveFrom <= start).sort((a,b) => b.effectiveFrom - a.effectiveFrom || b.createdAt - a.createdAt || b.id.localeCompare(a.id))[0] ?? null;
}
