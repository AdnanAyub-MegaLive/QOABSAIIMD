import { expect, it, vi } from "vitest";
import { dashboardRange, dailySeries, dashboardData } from "./dashboard-data.js";
it("uses explicit UTC day boundaries and bounded periods", () => {
  const range = dashboardRange("30", new Date("2026-10-13T23:59:00Z"));
  expect(range.today.toISOString()).toBe("2026-10-13T00:00:00.000Z");
  expect(range.start.toISOString()).toBe("2026-09-14T00:00:00.000Z");
  expect(dashboardRange("999").days).toBe(7);
});
it("fills missing days with zero and preserves large coin amounts", () => {
  const points = dailySeries([{ day: "2026-10-13", value: 9007199254740993n }], new Date("2026-10-12T00:00:00Z"), 2);
  expect(points).toEqual([{ day: "2026-10-12", value: "0" }, { day: "2026-10-13", value: "9007199254740993" }]);
});
it("does not query sensitive modules without view permission", async () => {
  const result = await dashboardData({}, { active: true, role: "STAFF", permissions: ["dashboard.view"] }, 7);
  expect(result.cards).toEqual([]); expect(result.charts).toEqual([]); expect(result.logs).toEqual([]);
});
it("shows agency totals and review counts to permitted staff only", async () => {
  const db = { agency: { count: vi.fn(async () => 4) }, agencyApplication: { count: vi.fn(async () => 2) } };
  const result = await dashboardData(db, { active: true, permissions: ["agencies.view"] }, 7);
  expect(result.cards[0]).toMatchObject({ label: "Active agencies", value: "4" });
  expect(result.attention[0].count).toBe(2);
  expect(db.agency.count).toHaveBeenCalledWith({ where: { status: "ACTIVE" } });
});
