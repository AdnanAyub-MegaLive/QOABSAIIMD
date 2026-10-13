import { expect, it } from "vitest";
import { readApkResponse } from "./apk-response";
it("explains HTML proxy errors without exposing HTML", async () => {
  await expect(readApkResponse(new Response("<html>too large</html>", { status: 413 }))).rejects.toThrow("251 MB");
  await expect(readApkResponse(new Response("<html>timeout</html>", { status: 504 }))).rejects.toThrow("before retrying");
});
it("preserves API errors and successful JSON", async () => {
  await expect(readApkResponse(Response.json({ success: false, error: { message: "Invalid APK" } }, { status: 422 }))).rejects.toThrow("Invalid APK");
  expect(await readApkResponse(Response.json({ success: true, data: {} }))).toEqual({ success: true, data: {} });
});
