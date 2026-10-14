export async function readBoundedMultipart(request, maxBytes) {
  const fail = () => Object.assign(new Error("Upload exceeds the configured request size."), { code: "FILE_TOO_LARGE", status: 413 });
  const limit = maxBytes + 65536;
  if (Number(request.headers.get("content-length")) > limit) throw fail();
  if (!request.body) throw Object.assign(new Error("An upload is required."), { code: "VALIDATION_ERROR" });
  const reader = request.body.getReader(), chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw fail(); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return new Response(Buffer.concat(chunks), { headers: { "content-type": request.headers.get("content-type") ?? "" } }).formData();
}
