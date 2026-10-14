import { expect, it } from "vitest";
import { readBoundedMultipart } from "./bounded-multipart.js";
it("reads a multipart upload within its limit", async () => {
  const body=new FormData();body.set("image",new Blob(["sample"]),"image.png");
  const form=await readBoundedMultipart(new Request("https://test",{method:"POST",body}),100);
  expect(await form.get("image").text()).toBe("sample");
});
it("bounds the stream without relying on Content-Length", async () => {
  await expect(readBoundedMultipart(new Request("https://test",{method:"POST",headers:{"content-type":"multipart/form-data; boundary=test"},body:new Uint8Array(65538)}),1)).rejects.toMatchObject({status:413});
});
