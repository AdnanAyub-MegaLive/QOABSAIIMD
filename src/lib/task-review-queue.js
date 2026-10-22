import { periodStart } from "./task-periods.js";
import { metricOf } from "./task-center-config.js";
import { reviewPage } from "./review-pagination.js";

export function evidenceActionable(row, now = new Date()) {
  const d = row?.definition;
  return Boolean(d && !row.claimedAt && row.reviewStatus === "PENDING" && metricOf(d) === "MANUAL" && d.active && !d.deletedAt && d.category?.active && row.periodStart.getTime() === periodStart(d, now).getTime());
}
export async function taskReviewQueue(db, params, now = new Date()) {
  const view = params.get("view") ?? "actionable";
  if (!["actionable", "history"].includes(view)) throw Object.assign(new Error("Choose actionable or history."), { status: 422 });
  const page = reviewPage(params, `task-evidence:${view}`, "updatedAt", view === "actionable" ? "asc" : "desc");
  const where = view === "actionable" ? {
    reviewStatus: "PENDING", claimedAt: null,
    definition: { active: true, deletedAt: null, category: { active: true }, OR: [{ metric: "MANUAL" }, { metric: null, type: "MANUAL" }, { metric: "", type: "MANUAL" }] },
    OR: ["BEGINNER", "DAILY", "WEEKLY", "MONTHLY"].map(cadence => ({ definition: { cadence }, periodStart: periodStart({ cadence }, now) })),
  } : { reviewStatus: { not: null } };
  const rows = await db.dailyTaskInstance.findMany({ where: { AND: [where, page.after] }, orderBy: page.orderBy, take: page.take,
    select: { id: true, updatedAt: true, periodStart: true, claimedAt: true, evidence: true, reviewStatus: true, reviewReason: true,
      definition: { select: { title: true, metric: true, type: true, cadence: true, active: true, deletedAt: true, category: { select: { active: true } } } },
      user: { select: { publicId: true, name: true } } } });
  const result = page.result(rows);
  return { ...result, items: result.items.map(row => ({ id: row.id, title: row.definition.title, user: row.user, evidence: row.evidence,
    reviewStatus: row.reviewStatus, reviewReason: row.reviewReason, periodStart: row.periodStart.toISOString(), updatedAt: row.updatedAt.toISOString(),
    actionable: view === "actionable" && evidenceActionable(row, now) })) };
}
