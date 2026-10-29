import { expect, it, vi } from "vitest";
import { previewUnusedUpload, deleteUnusedUpload } from "./unused-upload-deletion.js";
const asset = { id: "cmv12345678901234567890123", publicId: "AST-test", name: "Test" };
function database(rows = []) {
  const db = {
    uploadAsset: { findUnique: vi.fn(async () => asset), delete: vi.fn(async () => ({ id: asset.id })) },
    admin: { findUnique: vi.fn(async () => ({ id: "admin", role: "SUPER_ADMIN", active: true, sessionVersion: 1 })) },
    auditLog: { create: vi.fn() },
    $queryRaw: vi.fn(), $executeRawUnsafe: vi.fn(),
    $queryRawUnsafe: vi.fn(async sql => sql.includes("pg_tables") ? [{ name: "UploadAsset" }, { name: "UserEquippedProp" }] : sql.includes("information_schema") ? [{ table: "UserEquippedProp", name: "assetId" }] : rows),
  };
  db.$transaction = vi.fn(fn => fn(db));
  return db;
}
const admin = { id: "admin", sessionVersion: 1 };
it("detects direct and JSON/text references without cascading into users", async () => {
  const db = database([{ locator: "1", version: "1", document: { assetId: "AST-test" } }]);
  expect((await previewUnusedUpload(db, "AST-test")).dependencies).toEqual([{ table: "UserEquippedProp", count: 1 }]);
});
it("refuses used uploads without deleting anything", async () => {
  const db = database([{ locator: "1", version: "1", document: { assetId: asset.id } }]);
  await expect(deleteUnusedUpload(db, admin, { assetId: "AST-test" })).rejects.toMatchObject({ code: "UPLOAD_IN_USE" });
  expect(db.uploadAsset.delete).not.toHaveBeenCalled();
});
it("deletes only an unused asset after the preview matches and retains audit history", async () => {
  const db = database();
  const { plan } = await previewUnusedUpload(db, "AST-test");
  await deleteUnusedUpload(db, admin, { assetId: "AST-test", fingerprint: plan.fingerprint });
  expect(db.uploadAsset.delete).toHaveBeenCalledWith({ where: { id: asset.id }, select: { id: true } });
  expect(db.auditLog.create).toHaveBeenCalledOnce();
});
it("rejects stale previews and changed admin sessions", async () => {
  const db = database();
  await expect(deleteUnusedUpload(db, admin, { assetId: "AST-test", fingerprint: "stale" })).rejects.toMatchObject({ code: "PREVIEW_STALE" });
  await expect(deleteUnusedUpload(db, { ...admin, sessionVersion: 2 }, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(db.uploadAsset.delete).not.toHaveBeenCalled();
});
