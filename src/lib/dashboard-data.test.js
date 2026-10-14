import { expect, it, vi } from "vitest";
import { dashboardRange, dailySeries, dashboardData } from "./dashboard-data.js";
it("shows all-time game spend and payouts without losing BigInt precision", async () => {
  const aggregate = vi.fn(async () => ({ _sum: { wager: 9007199254740993n, payout: 700n } }));
  const result = await dashboardData({ gameLog: { aggregate } }, { active: true, permissions: ["games.view"] }, 7);
  expect(aggregate).toHaveBeenCalledWith({ _sum: { wager: true, payout: true } });
  expect(result.cards).toEqual([expect.objectContaining({ label: "Games · all time", value: "9007199254740993", wins: "700", href: "/games-management" })]);
});
it("shows zero game totals when no rounds have been recorded", async () => {
  const result = await dashboardData({ gameLog: { aggregate: async () => ({ _sum: { wager: null, payout: null } }) } }, { active: true, permissions: ["games.view"] }, 30);
  expect(result.cards[0]).toMatchObject({ value: "0", wins: "0" });
});
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
