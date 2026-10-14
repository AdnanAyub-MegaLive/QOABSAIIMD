// Bound multipart bodies before parsing, including chunked requests with no length.
export async function readUploadForm(request, maxBytes) {
  const invalid = (message, status = 422) => Object.assign(new Error(message), { status, code: status === 413 ? "FILE_TOO_LARGE" : "VALIDATION_ERROR" });
  const contentType = request.headers.get("content-type");
  if (!contentType?.toLowerCase().startsWith("multipart/form-data;") || !request.body) throw invalid("Send a multipart upload.");
  if (Number(request.headers.get("content-length")) > maxBytes) throw invalid("Upload request is too large.", 413);
  const reader = request.body.getReader(), parts = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw invalid("Upload request is too large.", 413); }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  let form;
  try { form = await new Response(Buffer.concat(parts, size), { headers: { "content-type": contentType } }).formData(); }
  catch { throw invalid("Malformed multipart upload."); }
  if (form.getAll("file").length !== 1 || form.getAll("posterFile").length > 1) throw invalid("Send one media file and at most one poster.");
  for (const [key, value] of form.entries()) if (value instanceof File && !["file", "posterFile"].includes(key)) throw invalid("Unexpected upload file field.");
  return form;
}
