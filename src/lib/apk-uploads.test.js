import { it, expect, vi } from "vitest";
vi.mock("unzipper", () => ({ Open: { buffer: vi.fn() } }));
import { Open } from "unzipper";
import { validateApk, apkDto, APK_MAX_BYTES } from "./apk-uploads";
const file = overrides => ({ name: "app.apk", size: 10, arrayBuffer: async () => new ArrayBuffer(10), ...overrides });
it("rejects non-APK files and oversized files", async () => {
  await expect(validateApk(file({ name: "app.html" }))).rejects.toThrow();
  await expect(validateApk(file({ size: APK_MAX_BYTES + 1 }))).rejects.toThrow();
});
it("requires an Android manifest and rejects malformed archives", async () => {
  Open.buffer.mockResolvedValue({ files: [] });
  await expect(validateApk(file())).rejects.toThrow();
  Open.buffer.mockRejectedValue(new Error("bad zip"));
  await expect(validateApk(file())).rejects.toThrow();
  Open.buffer.mockResolvedValue({ files: [{ path: "AndroidManifest.xml", type: "File", uncompressedSize: 100, flags: 0 }] });
  await expect(validateApk(file())).resolves.toBeInstanceOf(Buffer);
});
it("returns a permanent public path without exposing bytes", () => {
  const dto = apkDto({ publicId: "APK-123", fileData: "private", active: true });
  expect(dto.downloadPath).toBe("/api/apk-downloads/APK-123");
  expect(dto).not.toHaveProperty("fileData");
});
