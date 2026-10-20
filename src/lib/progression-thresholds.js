export const MAX_LEVEL_POINTS = 9223372036854775807n;
const labels = { USER: "Wealth", CHARM: "Charm" };
function invalid(message, field = "levels") {
  throw Object.assign(new Error(message), { code: "VALIDATION_ERROR", fields: { [field]: message } });
}
// Browser-safe shared validation. Thresholds are cumulative integers, not XP per level.
export function validateProgressionThresholds(levels) {
  if (!Array.isArray(levels) || levels.length > 1000) invalid("Provide at most 1,000 level rows.");
  for (const row of levels) {
    if (!row || !labels[row.track] || !Number.isSafeInteger(row.level) || row.level < 0) invalid("Choose a valid Wealth or Charm level number.");
    const field = `${row.track}:${row.level}`;
    if (!/^\d+$/.test(String(row.thresholdPoints)) || (typeof row.thresholdPoints === "number" && !Number.isSafeInteger(row.thresholdPoints))) invalid(`${labels[row.track]} Level ${row.level}: enter a non-negative whole-number cumulative XP threshold (no decimals or separators).`, field);
    if (BigInt(row.thresholdPoints) > MAX_LEVEL_POINTS) invalid(`${labels[row.track]} Level ${row.level}: XP cannot exceed ${MAX_LEVEL_POINTS}.`, field);
  }
  for (const track of Object.keys(labels)) {
    const rows = levels.filter(row => row.track === track).sort((a,b) => a.level-b.level);
    if (!rows.length || rows[0].level !== 0 || BigInt(rows[0].thresholdPoints) !== 0n) invalid(`${labels[track]} needs a Level 0 baseline with 0 XP.`, `${track}:0`);
    for (let i=1;i<rows.length;i++) {
      const row=rows[i], previous=rows[i-1], field=`${track}:${row.level}`;
      if(row.level===previous.level) invalid(`${labels[track]} Level ${row.level} appears more than once. Remove the duplicate level.`,field);
      if(BigInt(row.thresholdPoints)<=BigInt(previous.thresholdPoints)) invalid(`${labels[track]} Level ${row.level} needs cumulative XP greater than Level ${previous.level} (${previous.thresholdPoints}). Enter at least ${BigInt(previous.thresholdPoints)+1n}.`,field);
    }
  }
}
