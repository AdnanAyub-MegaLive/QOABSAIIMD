import { expect, it } from "vitest";
import { profileVisitBoundary, profileVisitCursor, profileVisitMetadata } from "./profile-visit-page.js";
it("preserves first/latest recorded UTC timestamps and count", () => {
  const row = { firstVisitedAt: new Date("2026-10-17T05:20:00Z"), lastVisitedAt: new Date("2026-10-19T05:20:00Z"), visitCount: 3 };
  expect(profileVisitMetadata(row)).toEqual({ firstVisitedAt: "2026-10-17T05:20:00.000Z", lastVisitedAt: "2026-10-19T05:20:00.000Z", visitCount: 3 });
});
it("uses a stable newest-first keyset with ascending visitor ID for ties", () => {
  const row = { visitorId: "u1", lastVisitedAt: new Date() };
  expect(profileVisitBoundary(profileVisitCursor(row))).toEqual({ OR: [{ lastVisitedAt: { lt: row.lastVisitedAt } }, { lastVisitedAt: row.lastVisitedAt, visitorId: { gt: "u1" } }] });
  expect(profileVisitBoundary(null)).toEqual({});
});
it("rejects malformed and old offset cursors explicitly", () => {
  for (const cursor of ["bad", Buffer.from('{"offset":20}').toString("base64url")]) expect(() => profileVisitBoundary(cursor)).toThrow();
});
