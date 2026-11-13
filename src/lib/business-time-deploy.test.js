import { expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
it('persists a deployment cutover once and rejects changing active calendar history', () => {
  const dir = mkdtempSync(path.join(tmpdir(),'mega-timezone-test-'));
  const file = path.join(dir,'.env.local');
  const run = (...args) => spawnSync(process.execPath,['scripts/prepare-business-timezone.mjs',dir,...args],{encoding:'utf8'});
  try {
    writeFileSync(file,'EXISTING_SETTING=keep\n');
    expect(run().status).toBe(0);
    const initial = readFileSync(file,'utf8');
    const cutoff = initial.match(/CUTOVER_AT=(.*)/)[1];
    expect(Date.parse(cutoff)-Date.now()).toBeGreaterThan(23*3600000);
    expect(run().status).toBe(0);
    expect(readFileSync(file,'utf8')).toBe(initial);
    expect(run('--activate').status).toBe(0);
    expect(readFileSync(path.join(dir,'.business-timezone-active'),'utf8')).toBe(cutoff);
    writeFileSync(file,initial.replace(cutoff,'2040-01-01T00:00:00Z'));
    expect(run().status).not.toBe(0);
  } finally {
    if (path.dirname(dir) === path.resolve(tmpdir()) && path.basename(dir).startsWith('mega-timezone-test-')) rmSync(dir,{recursive:true,force:true});
  }
});
it('refuses an overdue initial deployment instead of rewriting paid history', () => {
  const dir = mkdtempSync(path.join(tmpdir(),'mega-timezone-test-'));
  try {
    writeFileSync(path.join(dir,'.env.local'),'NEXT_PUBLIC_BUSINESS_TIMEZONE_CUTOVER_AT=2000-01-01T00:00:00Z\n');
    const result = spawnSync(process.execPath,['scripts/prepare-business-timezone.mjs',dir],{encoding:'utf8'});
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('initial UTC+7 deployment window has passed');
  } finally {
    if (path.dirname(dir) === path.resolve(tmpdir()) && path.basename(dir).startsWith('mega-timezone-test-')) rmSync(dir,{recursive:true,force:true});
  }
});
