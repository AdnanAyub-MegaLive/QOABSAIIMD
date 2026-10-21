import { expect, it, vi } from "vitest";
import { reportInput, submitSafetyReport } from "./safety-reports.js";
const input = { targetType: "USER", targetId: "USR-1", reason: "HARASSMENT", details: "Evidence", requestId: "request-1" };
function database() {
  const rows = new Map();
  const db = { rows, $queryRaw:vi.fn(), user: { findUnique: vi.fn(async () => ({ id: "target" })) }, audioRoom: { findUnique: vi.fn(async () => ({ id: "room" })) }, safetyReport: {
    findUnique: vi.fn(async ({ where }) => rows.get(JSON.stringify(where.reporterUserId_requestId))),
    findFirst:vi.fn(async({where})=>[...rows.values()].find(r=>r.reporterUserId===where.reporterUserId&&r.targetType===where.targetType&&r.targetInternalId===where.targetInternalId&&["OPEN","REVIEWING"].includes(r.status))),
    create: vi.fn(async ({ data }) => { const row={status:"OPEN",...data};rows.set(JSON.stringify({ reporterUserId: data.reporterUserId, requestId: data.requestId }), row); return row; }),
  } };
  db.$transaction=fn=>fn(db);return db;
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
  await expect(submitSafetyReport(db, "a", { ...input, reason: "OTHER" })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
});
it("handles a concurrent unique-key winner by replaying its result", async () => {
  const db = database(); const saved = await submitSafetyReport(db, "a", input);
  db.safetyReport.findUnique.mockResolvedValueOnce(null);
  db.safetyReport.findFirst.mockResolvedValueOnce(null);
  db.safetyReport.create.mockRejectedValueOnce({ code: "P2002" });
  expect(await submitSafetyReport(db, "a", input)).toEqual(saved);
});
it.each([{ targetType: "INVALID" }, { details: "x".repeat(501) }, { requestId: "" }, { reason: "" }])("validates report fields %j", change => {
  expect(() => reportInput({ ...input, ...change })).toThrow();
});
it("does not create a report for a nonexistent target", async () => {
  const db = database(); db.user.findUnique.mockResolvedValue(null);
  await expect(submitSafetyReport(db, "a", input)).rejects.toMatchObject({ code: "TARGET_NOT_FOUND" });
  expect(db.safetyReport.create).not.toHaveBeenCalled();
});
it("rejects self reports without creating a record",async()=>{
 const db=database();await expect(submitSafetyReport(db,"target",input)).rejects.toMatchObject({code:"VALIDATION_ERROR"});expect(db.safetyReport.create).not.toHaveBeenCalled();
});
it("rejects a new key for the same open target, including renamed public IDs",async()=>{
 const db=database();await submitSafetyReport(db,"a",input);
 await expect(submitSafetyReport(db,"a",{...input,targetId:"TLN-1",requestId:"another"})).rejects.toMatchObject({code:"DUPLICATE_REPORT",status:409});
 expect(db.safetyReport.create).toHaveBeenCalledTimes(1);
 [...db.rows.values()][0].status="DISMISSED";
 await expect(submitSafetyReport(db,"a",{...input,requestId:"another"})).resolves.toHaveProperty("reportId");
});
it.each(["SPAM","HARASSMENT","SEXUAL","VIOLENCE","SCAM","OTHER"])("accepts reason %s",reason=>expect(reportInput({...input,reason}).reason).toBe(reason));
it("rejects unsupported reasons and live-room reports",()=>{
 expect(()=>reportInput({...input,reason:"anything"})).toThrow();
 expect(()=>reportInput({...input,targetType:"LIVE_ROOM"})).toThrow();
});
