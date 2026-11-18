import { fitsPattern, validPattern } from "./pretty-id.js";
import { occupiedSpecialId } from "./special-id-ownership.js";

const fail = (code, message, status = 409) => { throw Object.assign(new Error(message), { code, status }); };
const amount = value => /^[1-9][0-9]{0,18}$/.test(String(value ?? "")) && BigInt(value) <= 9223372036854775807n;

export function prettyCombinationInput({ pattern, price, durationDays, visible }) {
  const code = String(pattern ?? "").trim().toUpperCase();
  const days = Number(durationDays);
  if (!validPattern(code)) fail("VALIDATION_ERROR", "Use a 3–7 letter pattern (A–Z), for example AABBCCD.", 422);
  if (!amount(price)) fail("VALIDATION_ERROR", "Enter a positive Coin price.", 422);
  if (!Number.isInteger(days) || days < 1 || days > 36500) fail("VALIDATION_ERROR", "Choose a validity of 1–36500 days.", 422);
  if (typeof visible !== "boolean") fail("VALIDATION_ERROR", "Select whether its IDs are listed in the Mall.", 422);
  return { pattern: code, coinPrice: BigInt(price), durationDays: days, storeVisible: visible };
}

export const serializeCombination = row => ({ id: row.id, pattern: row.pattern, characters: row.pattern.length, coinPrice: row.coinPrice.toString(), durationDays: row.durationDays, storeVisible: row.storeVisible,
  ids: (row.ids ?? []).filter(item => item.active).map(item => ({ id: item.id, code: item.code, sold: (item.assignments ?? []).length > 0 })) });

export function parseCombinationCodes(pattern, text) {
  const codes = [...new Set(String(text ?? "").toUpperCase().split(/[\s,;]+/).filter(Boolean))];
  if (!codes.length) fail("VALIDATION_ERROR", "Enter at least one ID.", 422);
  if (codes.length > 500) fail("VALIDATION_ERROR", "Add up to 500 IDs at a time.", 422);
  const wrong = codes.filter(code => !fitsPattern(pattern, code));
  return { codes: codes.filter(code => !wrong.includes(code)), wrong };
}

export async function addCombinationIds(tx, combination, text, now = new Date()) {
  const { codes, wrong } = parseCombinationCodes(combination.pattern, text);
  const [reserved, defined, occupied] = await Promise.all([
    tx.publicNumberReservation.findMany({ where: { number: { in: codes }, kind: "NORMAL" }, select: { number: true } }),
    tx.specialIdDefinition.findMany({ where: { code: { in: codes, mode: "insensitive" } }, select: { code: true, active: true, combinationId: true } }),
    tx.specialIdAssignment.findMany({ where: { specialId: { in: codes, mode: "insensitive" }, ...occupiedSpecialId(now) }, select: { specialId: true } }),
  ]);
  const taken = new Set([...reserved.map(r => r.number), ...defined.filter(d => d.active).map(d => d.code), ...occupied.map(o => o.specialId)].map(c => c.toUpperCase()));
  const added = [];
  for (const code of codes) {
    if (taken.has(code)) continue;
    const data = { active: true, category: "STANDARD", coinPrice: combination.coinPrice, storeVisible: combination.storeVisible, defaultDurationMinutes: combination.durationDays * 1440, combinationId: combination.id, minimumVipLevel: null, minimumTopUpAmount: null };
    await tx.specialIdDefinition.upsert({ where: { code }, update: data, create: { code, ...data } });
    added.push(code);
  }
  return { added, wrong, taken: codes.filter(code => taken.has(code)) };
}

export async function syncCombinationIds(tx, combination) {
  await tx.specialIdDefinition.updateMany({ where: { combinationId: combination.id, active: true }, data: { coinPrice: combination.coinPrice, storeVisible: combination.active && combination.storeVisible, defaultDurationMinutes: combination.durationDays * 1440 } });
}
