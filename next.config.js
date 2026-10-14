// next.config.js
const { PHASE_DEVELOPMENT_SERVER } = require('next/constants');

module.exports = (phase) => ({
  // A production build cleans its output directory. Keep the running custom
  // dev server's manifests outside that tree so builds cannot remove them.
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next-development' : '.next',
  allowedDevOrigins: ['192.168.88.49'],
  experimental: {
    serverActions: {
      // Allow 50 MiB media + a 5 MiB poster and multipart overhead.
      // Individual upload validation remains authoritative. APKs use the
      // separate /api/admin/apks route and retain their 250 MiB file limit.
      bodySizeLimit: '56mb',
    },
  },
  // Archive libraries use optional Node-only adapters that Turbopack should
  // leave to the server runtime instead of bundling for route handlers.
  serverExternalPackages: ['unzipper', 'node-unrar-js'],
})
