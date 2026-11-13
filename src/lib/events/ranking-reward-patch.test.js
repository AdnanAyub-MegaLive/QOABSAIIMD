import { describe,it,expect } from 'vitest';
import { patchRewardModal } from './ranking-reward-patch';
import { readFileSync } from 'node:fs';
describe('reward modal publication',()=>{
  it('preserves custom code and is idempotent',()=>{
    const template=readFileSync('event-templates/ranking-cp/app.js','utf8');
    const original="CUSTOM DESIGN\n  function renderRewards(data){ old(); }\n  const notify = custom;";
    const patched=patchRewardModal(original,template);
    expect(patched.startsWith('CUSTOM DESIGN\n')).toBe(true);
    expect(patched.endsWith('  const notify = custom;')).toBe(true);
    expect(patched).toContain('/api/v1/events/ranking-rewards?');
    expect(patchRewardModal(patched,template)).toBe(patched);
  });
  it('refuses unknown scripts instead of replacing the design',()=>expect(()=>patchRewardModal('custom','custom')).toThrow());
});
