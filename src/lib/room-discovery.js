import { normalizeSignupCountry } from "./geo-country.js";

export const DISCOVER_PAGE_SIZE = 50;

export function discoverableRoomWhere(userId, includeIdle = false) {
  return {
    ownerId: { not: userId },
    status: includeIdle ? { in: ["LIVE", "IDLE"] } : "LIVE",
    isBlocked: false,
    joiningDisabled: false,
    privacyMode: { not: "HIDDEN" },
    owner: { deletedAt: null, status: "ACTIVE" },
  };
}

export function countryVariants(code, countries) {
  return [...new Set(countries.filter(value => value && normalizeSignupCountry(value) === code))];
}

export function liveCountryCounts(rows) {
  const counts = new Map();
  for (const row of rows) {
    const code = normalizeSignupCountry(row.country);
    if (!code) continue;
    counts.set(code, (counts.get(code) ?? 0) + row._count._all);
  }
  return [...counts].map(([code, liveRooms]) => ({ code, liveRooms }))
    .sort((a, b) => b.liveRooms - a.liveRooms || a.code.localeCompare(b.code));
}
