const { isIP } = require("node:net");
const normalize = value => {
  const ip = typeof value === "string" ? value.trim().replace(/^::ffff:/i, "") : "";
  return isIP(ip) ? ip : null;
};

// Trust only explicitly listed immediate proxy peers, never arbitrary clients.
function setRequestClientIp(request, trustedPeers = process.env.TRUSTED_PROXY_IPS || "") {
  const peer = normalize(request.socket?.remoteAddress);
  const trusted = new Set(trustedPeers.split(",").map(normalize).filter(Boolean));
  const forwarded = trusted.has(peer)
    ? normalize(String(request.headers["x-forwarded-for"] || "").split(",")[0]) || normalize(request.headers["x-real-ip"])
    : null;
  const ip = forwarded || peer;
  delete request.headers["x-forwarded-for"];
  delete request.headers["x-real-ip"];
  if (ip) request.headers["x-forwarded-for"] = request.headers["x-real-ip"] = ip;
}
module.exports = { setRequestClientIp };
