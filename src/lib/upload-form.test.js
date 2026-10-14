import { it, expect } from "vitest";
import { readUploadForm } from "./upload-form.js";
function request(files = ["file"], text = "hello") {
  const form = new FormData();
  for (const name of files) form.append(name, new File([text], "test.svga"));
  return new Request("https://portal.test", { method: "POST", body: form });
}
it("bounds chunked multipart bodies and rejects duplicates/unexpected files", async () => {
  const oversized = request(["file"], "x".repeat(2000));
  // Buffer-backed request models a socket body without undici's asynchronous
  // FormData/Blob producer (which races cancellation in Node's test runtime).
  const chunked = new Request(oversized.url, { method: "POST", headers: oversized.headers, body: await oversized.arrayBuffer() });
  await expect(readUploadForm(chunked, 1000)).rejects.toMatchObject({ status: 413 });
  for (const files of [["file", "file"], ["file", "posterFile", "posterFile"], ["file", "extra"]]) await expect(readUploadForm(request(files), 10000)).rejects.toMatchObject({ status: 422 });
  const form = await readUploadForm(request(["file", "posterFile"]), 10000);
  expect(form.get("file").size).toBe(5);
});
