// Set final response headers in the custom server, after Next/route handlers.
// Do not weaken private media, signed responses, authentication or error policies.
function applyWebCacheHeaders(request, response) {
  const original = response.writeHead;
  response.writeHead = function(status, ...args) {
    // Some handlers supply headers directly to writeHead.
    const explicit = typeof args[0] === "string" ? args[1] : args[0];
    if (explicit && !Array.isArray(explicit)) {
      for (const [key, value] of Object.entries(explicit)) this.setHeader(key, value);
    }
    const type = String(this.getHeader("Content-Type") ?? "").toLowerCase();
    const policy = String(this.getHeader("Cache-Control") ?? "").toLowerCase();
    const path = String(request.url ?? "").split("?")[0];
    const cacheableMethod = ["GET","HEAD"].includes(request.method);
    if (cacheableMethod && status >= 200 && status < 300 &&
        !path.startsWith("/_next/static/") &&
        (type.includes("text/html") || type.includes("application/json") || type.includes("text/x-component"))) {
      if (!policy.includes("no-store")) this.setHeader("Cache-Control","private, no-cache, must-revalidate");
    }
    // writeHead's explicit headers would otherwise overwrite the final policy.
    if (explicit && !Array.isArray(explicit)) {
      for (const key of Object.keys(explicit)) if (key.toLowerCase() === "cache-control") explicit[key] = this.getHeader("Cache-Control");
    }
    return original.call(this,status,...args);
  };
}
module.exports = { applyWebCacheHeaders };
