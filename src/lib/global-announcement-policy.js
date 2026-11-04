export const announcementTypes = ["BIG_GIFT", "GAME_WIN", "LUCKY_RETURN", "ROCKET_LAUNCH"];
export const announcementDefaults = {
  rules: Object.fromEntries(announcementTypes.map(type => [type, type === "ROCKET_LAUNCH" ? { enabled: true, minimumLevel: 1 } : { enabled: false, minimumCoins: "100000" }])),
  cooldownSeconds: 10,
  lifetimeSeconds: 60,
};
export function effectiveAnnouncementPolicy(stored) {
  return { ...announcementDefaults, revision: 0, ...stored, rules: { ...announcementDefaults.rules, ...stored?.rules } };
}
export function validateAnnouncementPolicy(input) {
  const fail = message => { throw Object.assign(new Error(message), { status: 422, code: "VALIDATION_ERROR" }); };
  const rules = {};
  for (const type of announcementTypes) {
    const rule = input?.rules?.[type];
    if (type === "ROCKET_LAUNCH") {
      if (typeof rule?.enabled !== "boolean" || !Number.isInteger(rule.minimumLevel) || rule.minimumLevel < 1 || rule.minimumLevel > 3)
        fail("Choose a minimum Rocket level from 1 to 3.");
      rules[type] = { enabled: rule.enabled, minimumLevel: rule.minimumLevel };
      continue;
    }
    if (typeof rule?.enabled !== "boolean" || typeof rule?.minimumCoins !== "string" || !/^[1-9]\d{0,17}$/.test(rule.minimumCoins))
      fail(`${type}: enter a positive whole-Coin threshold (up to 18 digits).`);
    rules[type] = { enabled: rule.enabled, minimumCoins: String(rule.minimumCoins) };
  }
  for (const [key, min, max] of [["cooldownSeconds", 1, 300], ["lifetimeSeconds", 15, 120]])
    if (!Number.isInteger(input[key]) || input[key] < min || input[key] > max) fail(`${key} must be ${min}–${max}.`);
  return { rules, cooldownSeconds: input.cooldownSeconds, lifetimeSeconds: input.lifetimeSeconds };
}
export function qualifiesForAnnouncement(candidate, policy) {
  const rule = policy.rules[candidate.type];
  if (candidate.type === "ROCKET_LAUNCH") return Boolean(rule?.enabled && candidate.details.level >= rule.minimumLevel);
  return Boolean(rule?.enabled && BigInt(candidate.amount) > 0n && BigInt(candidate.amount) >= BigInt(rule.minimumCoins));
}
