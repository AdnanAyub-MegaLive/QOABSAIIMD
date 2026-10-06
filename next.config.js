// next.config.js
const { PHASE_DEVELOPMENT_SERVER } = require('next/constants');

module.exports = (phase) => ({
  // A production build cleans its output directory. Keep the running custom
  // dev server's manifests outside that tree so builds cannot remove them.
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next-development' : '.next',
  allowedDevOrigins: ['192.168.88.49'],
  // Archive libraries use optional Node-only adapters that Turbopack should
  // leave to the server runtime instead of bundling for route handlers.
  serverExternalPackages: ['unzipper', 'node-unrar-js'],
})
