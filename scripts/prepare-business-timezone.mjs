import { readFileSync, appendFileSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'dotenv';

// Persist once, before Next builds its client bundles. Never recalculate this on
// subsequent deploys: historical receipts depend on the same calendar forever.
const file = path.resolve(process.argv[2] || '.', '.env.local');
const env = parse(readFileSync(file));
const key = 'NEXT_PUBLIC_BUSINESS_TIMEZONE_CUTOVER_AT';
const marker = path.join(path.dirname(file), '.business-timezone-active');
if (process.argv.includes('--activate')) {
  if (!env[key]) throw Error('Missing business timezone cutover.');
  writeFileSync(marker, env[key], {mode:0o600});
  process.exit(0);
}
if (env[key]) {
  if (!Number.isFinite(Date.parse(env[key]))) throw Error('Invalid business timezone cutover.');
  if (existsSync(marker) && readFileSync(marker,'utf8') !== env[key]) throw Error('The permanent business timezone cutover was changed. Restore the original value before deploying.');
  if (!existsSync(marker) && Date.parse(env[key]) <= Date.now()) throw Error('The initial UTC+7 deployment window has passed. Review the prepared cutover and future schedules before retrying; do not apply a retroactive cutover.');
  console.log(`Business calendar cutover retained: ${env[key]}`);
} else {
  const at = new Date();
  at.setUTCHours(0, 0, 0, 0);
  at.setUTCDate(at.getUTCDate() + 2);
  appendFileSync(file, `\n# Permanent calendar history boundary. Do not change after deployment.\n${key}=${at.toISOString()}\n`);
  console.log(`Business calendar cutover prepared: ${at.toISOString()}`);
}
