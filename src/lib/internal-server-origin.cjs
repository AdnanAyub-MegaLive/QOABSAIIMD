// Server Actions fetch their redirected RSC page from this HTTP listener.
// Never derive this address from untrusted Host/X-Forwarded-* request headers.
function internalServerOrigin(hostname, port) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
  const host = hostname === '0.0.0.0' ? '127.0.0.1' : hostname === '::' ? '[::1]' : hostname.includes(':') && !hostname.startsWith('[') ? `[${hostname}]` : hostname;
  const url = new URL(`http://${host}:${port}`);
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash || Number(url.port || 80) !== port) throw new Error('Invalid internal server address.');
  return url.origin;
}
module.exports = { internalServerOrigin };
