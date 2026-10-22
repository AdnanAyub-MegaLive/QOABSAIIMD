import { expect, it, vi } from "vitest";
import { evidenceActionable, taskReviewQueue } from "./task-review-queue.js";
import { periodStart } from "./task-periods.js";
const now = new Date("2026-10-22T14:00:00Z");
function row(cadence = "DAILY") { return { id: "a", updatedAt: now, reviewStatus: "PENDING", claimedAt: null, periodStart: periodStart({ cadence }, now), definition: { cadence, active: true, deletedAt: null, metric: "MANUAL", category: { active: true } } }; }
it("accepts only current, enabled, unclaimed manual evidence", () => {
  for (const cadence of ["BEGINNER", "DAILY", "WEEKLY", "MONTHLY"]) expect(evidenceActionable(row(cadence), now)).toBe(true);
  for (const override of [{ claimedAt: now }, { reviewStatus: "APPROVED" }, { periodStart: new Date("2025-01-01") }]) expect(evidenceActionable({ ...row(), ...override }, now)).toBe(false);
  for (const override of [{ active: false }, { deletedAt: now }, { category: { active: false } }, { metric: "SEND_GIFTS" }]) expect(evidenceActionable({ ...row(), definition: { ...row().definition, ...override } }, now)).toBe(false);
  expect(evidenceActionable(row(), new Date("2026-10-23T00:00:00Z"))).toBe(false);
});
it("filters stale evidence in the database before paginating; history remains read-only", async () => {
  const db = { dailyTaskInstance: { findMany: vi.fn().mockResolvedValue([row()]) } };
  const result = await taskReviewQueue(db, new URLSearchParams(), now);
  expect(result.items[0].actionable).toBe(true);
  const query = db.dailyTaskInstance.findMany.mock.lastCall[0];
  expect(query).toMatchObject({ take: 51, orderBy: [{ updatedAt: "asc" }, { id: "asc" }] });
  expect(query.where.AND[0]).toMatchObject({ claimedAt: null, reviewStatus: "PENDING", definition: { category: { active: true } } });
  expect(query.where.AND[0].OR).toHaveLength(4);
  expect((await taskReviewQueue(db, new URLSearchParams("view=history"), now)).items[0].actionable).toBe(false);
  expect(db.dailyTaskInstance.findMany.mock.lastCall[0].where.AND[0]).toEqual({ reviewStatus: { not: null } });
});
