export async function readApkResponse(response) {
  const text = await response.text();
  let result;
  try { result = JSON.parse(text); } catch {
    if (response.status === 413) throw new Error("The server or proxy rejected this upload as too large. APKs support 250 MB; ask the administrator to set the proxy body limit to 251 MB.");
    if ([502, 503, 504].includes(response.status)) throw new Error(`The upload server is unavailable or timed out (HTTP ${response.status}). Refresh the APK list before retrying to avoid duplicate uploads.`);
    if (response.redirected || response.status === 401) throw new Error("Your portal session may have expired. Sign in again and retry.");
    throw new Error(`The server returned an unexpected response (HTTP ${response.status}). Check the proxy and portal logs.`);
  }
  if (!response.ok || result?.success !== true) throw new Error(result?.error?.message || `Request failed (HTTP ${response.status}).`);
  return result;
}
