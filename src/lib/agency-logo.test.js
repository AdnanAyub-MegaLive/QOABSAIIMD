import { expect, it, vi } from "vitest";
import sharp from "sharp";
import { saveAgencyLogo, agencyLogoUrl } from "./agency-logo.js";
import { readAvatarUpload } from "./avatar-upload.js";

function database(owned = [{ id: "agency" }]) {
  const db = { agency: { findMany: vi.fn(async () => owned), findFirst: vi.fn(async () => owned[0]), update: vi.fn() },
    uploadAsset: { create: vi.fn(), findFirst: vi.fn() }, auditLog: { create: vi.fn() } };
  db.$transaction = vi.fn(async fn => fn(db));
  return db;
}
async function photo() {
  return new File([await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } }).png().toBuffer()], "logo.png", { type: "image/png" });
}
it("saves validated artwork and returns a versioned public display URL", async () => {
  vi.stubEnv("AUTH_SECRET", "test-only");
  const db = database();
  const result = await saveAgencyLogo(db, "owner", "AGN-1", await photo(), "https://portal.test");
  expect(result.logoUrl).toContain("displaySig=");
  expect(result.logoUrl).toContain("v=");
  expect(db.agency.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { ownerUserId: "owner", publicId: "AGN-1" } }));
  expect(db.uploadAsset.create).toHaveBeenCalledWith({ data: expect.objectContaining({ category: "AGENCY_ARTWORK", mimeType: "image/webp", storeVisible: false }) });
  expect(db.agency.update).toHaveBeenCalledOnce();
  vi.unstubAllEnvs();
});
it.each([[[], null, "FORBIDDEN"], [[], "AGN-other", "AGENCY_NOT_FOUND"], [[{ id: "a" }, { id: "b" }], null, "AGENCY_SELECTION_REQUIRED"]])("rejects missing or ambiguous ownership", async (owned, id, code) => {
  const db = database(owned);
  await expect(saveAgencyLogo(db, "owner", id, await photo(), "https://portal.test")).rejects.toMatchObject({ code });
  expect(db.$transaction).not.toHaveBeenCalled();
});
it("rechecks ownership before writing", async () => {
  vi.stubEnv("AUTH_SECRET", "test-only");
  const db = database(); db.agency.findFirst.mockResolvedValue(null);
  await expect(saveAgencyLogo(db, "owner", null, await photo(), "https://portal.test")).rejects.toMatchObject({ code: "AGENCY_NOT_FOUND" });
  expect(db.uploadAsset.create).not.toHaveBeenCalled();
  vi.unstubAllEnvs();
});
it("rejects GIF, corrupt images, and oversized files", async () => {
  for (const [file, code] of [
    [new File(["GIF89a"], "a.gif", { type: "image/gif" }), "VALIDATION_ERROR"],
    [new File(["not png"], "a.png", { type: "image/png" }), "VALIDATION_ERROR"],
    [new File([new Uint8Array(5 * 1024 * 1024 + 1)], "a.png", { type: "image/png" }), "FILE_TOO_LARGE"],
  ]) await expect(saveAgencyLogo(database(), "owner", null, file, "https://portal.test")).rejects.toMatchObject({ code });
});
it("retains the agency selector in the bounded multipart reader", async () => {
  const form = new FormData(); form.set("image", await photo()); form.set("agencyId", "AGN-1");
  const result = await readAvatarUpload(new Request("https://portal.test", { method: "POST", body: form }));
  expect(result.form.get("agencyId")).toBe("AGN-1");
  expect(result.file.type).toBe("image/png");
});
it("returns null without a logo", async () => {
  expect(await agencyLogoUrl(database(), null, "https://portal.test")).toBeNull();
});
