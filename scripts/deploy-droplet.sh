#!/usr/bin/env bash
# Run from the portal checkout after reviewing/pulling the intended commit.
# No seed, reset, reconciliation, payout replay or data cleanup is performed.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
test -f package-lock.json
test -f .env.local
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo 'Tracked files differ from Git. Preserve/review those edits before deployment.' >&2
  exit 1
fi
echo "Deploying $(git rev-parse --short HEAD)"
node scripts/check-auth-config.mjs
node scripts/check-media-tools.mjs
# Stop before npm ci/build can remove files used by the running process.
pm2 stop megalive-portal
trap 'echo "Deployment failed; portal remains stopped. Fix the error before restarting." >&2' ERR
npm ci --include=dev
npx prisma migrate deploy
npx prisma generate
npm run build
test -s .next/BUILD_ID
test -s .next/required-server-files.json
# Next stores preview configuration in the prerender manifest.
node - <<'NODE'
const fs = require("node:fs");
const manifest = JSON.parse(fs.readFileSync(".next/prerender-manifest.json", "utf8"));
for (const key of ["previewModeId", "previewModeSigningKey", "previewModeEncryptionKey"]) {
  if (!manifest.preview?.[key]) throw new Error(`Missing preview configuration: ${key}`);
}
NODE
pm2 restart megalive-portal --update-env
pm2 save
trap - ERR
