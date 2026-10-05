import { expect, it, vi } from "vitest";
vi.mock("./prisma.js", () => ({ prisma: {} }));
import { salaryMonth, sessionAttendance } from "./agency-salary.js";
it("validates UTC month boundaries including year rollover", () => {
  expect(salaryMonth("2025-12").end.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  for (const value of ["2026-13", "2026-1", "abcd", "2999-01"]) expect(() => salaryMonth(value)).toThrow();
});
it("clips sessions, deduplicates overlaps and counts UTC active days", () => {
  const start = new Date("2026-09-01T00:00:00Z"), end = new Date("2026-10-01T00:00:00Z");
  expect(sessionAttendance([
    { startedAt: "2026-08-31T23:00:00Z", endedAt: "2026-09-01T01:00:00Z" },
    { startedAt: "2026-09-01T00:30:00Z", endedAt: "2026-09-01T02:00:00Z" },
    { startedAt: "2026-09-30T23:30:00Z", endedAt: "2026-10-01T01:00:00Z" },
  ], start, end)).toEqual({ liveMinutes: 150, activeDays: 2 });
});
