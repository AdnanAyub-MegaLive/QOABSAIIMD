import { expect, it, vi } from "vitest";
import { reportInput, submitSafetyReport } from "./safety-reports.js";
const input = { targetType: "USER", targetId: "USR-1", reason: "Harassment", details: "Evidence", requestId: "request-1" };
function database() {
  const rows = new Map();
  return { rows, user: { findUnique: vi.fn(async () => ({ id: "target" })) }, audioRoom: { findUnique: vi.fn(async () => ({ id: "room" })) }, safetyReport: {
    findUnique: vi.fn(async ({ where }) => rows.get(JSON.stringify(where.reporterUserId_requestId))),
    create: vi.fn(async ({ data }) => { rows.set(JSON.stringify({ reporterUserId: data.reporterUserId, requestId: data.requestId }), data); return data; }),
  } };
}
it.each(["USER", "AUDIO_ROOM"])("saves %s reports and returns only a report ID", async targetType => {
  const db = database(), result = await submitSafetyReport(db, "reporter", { ...input, targetType });
  expect(result.reportId).toMatch(/^RPT-/); expect(Object.keys(result)).toEqual(["reportId"]);
  expect(db.safetyReport.create).toHaveBeenCalledWith({ data: expect.objectContaining({ reporterUserId: "reporter", targetType }) });
});
it("replays without creating another report and isolates keys per reporter", async () => {
  const db = database(), first = await submitSafetyReport(db, "a", input);
  expect(await submitSafetyReport(db, "a", input)).toEqual(first);
  expect(db.safetyReport.create).toHaveBeenCalledTimes(1);
  expect(await submitSafetyReport(db, "b", input)).not.toEqual(first);
});
it("rejects changed content on the same request key", async () => {
  const db = database(); await submitSafetyReport(db, "a", input);
  await expect(submitSafetyReport(db, "a", { ...input, reason: "Other" })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
});
it("handles a concurrent unique-key winner by replaying its result", async () => {
  const db = database(); const saved = await submitSafetyReport(db, "a", input);
  db.safetyReport.findUnique.mockResolvedValueOnce(null);
  db.safetyReport.create.mockRejectedValueOnce({ code: "P2002" });
  expect(await submitSafetyReport(db, "a", input)).toEqual(saved);
});
it.each([{ targetType: "INVALID" }, { details: "x".repeat(501) }, { requestId: "" }, { reason: "" }])("validates report fields %j", change => {
  expect(() => reportInput({ ...input, ...change })).toThrow();
});
it("does not create a report for a nonexistent target", async () => {
  const db = database(); db.user.findUnique.mockResolvedValue(null);
  await expect(submitSafetyReport(db, "a", input)).rejects.toMatchObject({ code: "REPORT_TARGET_NOT_FOUND" });
  expect(db.safetyReport.create).not.toHaveBeenCalled();
});
