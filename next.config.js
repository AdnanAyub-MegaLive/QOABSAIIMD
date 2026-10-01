// next.config.js
module.exports = {
  allowedDevOrigins: ['192.168.88.49'],
  // Archive libraries use optional Node-only adapters that Turbopack should
  // leave to the server runtime instead of bundling for route handlers.
  serverExternalPackages: ['unzipper', 'node-unrar-js'],
}
