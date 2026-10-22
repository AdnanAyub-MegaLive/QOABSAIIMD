import { expect, it, vi } from "vitest";
import { auditExport } from "./audit-export.js";
it("exports beyond 500 with stable ordering, redaction and bounded reads", async () => {
  const date = new Date("2026-10-22T00:00:00Z");
  const rows = Array.from({ length: 500 }, (_, i) => ({ id: String(1000 - i), createdAt: date, metadata: { password: "secret" } }));
  const db = { auditLog: { findMany: vi.fn().mockResolvedValueOnce(rows).mockResolvedValueOnce([{ id: "500", createdAt: date }]) } };
  const response = new Response(await auditExport(db, { category: "FINANCE" }, undefined, date));
  const body = await response.json();
  expect(body.data.items).toHaveLength(501); expect(body.data.truncated).toBe(false);
  expect(body.data.items[0].details.password).toBe("[REDACTED]");
  expect(db.auditLog.findMany.mock.lastCall[0]).toMatchObject({ take: 500, where: { AND: [{ category: "FINANCE" }, { createdAt: { lte: date } }, { OR: [{ createdAt: { lt: date } }, { createdAt: date, id: { lt: "501" } }] }] } });
});
it("does not report a partial download as a successful complete export", async () => {
  const db = { auditLog: { findMany: vi.fn().mockRejectedValue(new Error("database unavailable")) } };
  await expect(auditExport(db, {})).rejects.toThrow("database unavailable");
});
