#!/usr/bin/env bash
# Build an isolated release while the current portal continues serving traffic.
set -euo pipefail
deploy() {
umask 077
repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo"
release_root="${repo}-releases"
mkdir -p "$release_root"
exec 9>"$release_root/deploy.lock"
flock -n 9 || { echo 'Another deployment is running.' >&2; exit 1; }
test -f .env.local
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo 'Tracked files differ from Git. Preserve/review those edits before deployment.' >&2
  exit 1
fi
git pull --ff-only origin main
release="$(mktemp -d "$release_root/$(git rev-parse --short HEAD)-XXXXXX")"
activating=0
on_error() {
  local result=$?
  trap - ERR
  if [ "$activating" = 1 ]; then
    echo 'New release failed. Restoring the previous PM2 configuration.' >&2
    if pm2 restart "$release/previous.ecosystem.json" --only megalive-portal --update-env; then
      pm2 save || true
    else
      echo 'Rollback failed. Check pm2 logs megalive-portal immediately.' >&2
    fi
  else
    echo 'Deployment preparation failed; the running portal was not stopped or restarted.' >&2
  fi
  echo "Release retained for inspection: $release" >&2
  exit "$result"
}
trap on_error ERR
pm2 jlist > "$release/pm2-before.json"
git archive HEAD | tar -x -C "$release"
# Share configuration and uploaded event files; never replace live node_modules/.next.
for env_file in .env .env.local .env.production .env.production.local; do
  if [ -f "$repo/$env_file" ]; then ln -s "$repo/$env_file" "$release/$env_file"; fi
done
mkdir -p "$repo/storage"
if [ -d "$release/storage" ]; then mv "$release/storage" "$release/storage-bundled"; fi
ln -s "$repo/storage" "$release/storage"
cd "$release"
echo "Preparing release $(git rev-parse --short HEAD 2>/dev/null || basename "$release") while the portal stays online"
npm ci --include=dev
node scripts/prepare-business-timezone.mjs "$repo"
node scripts/prepare-droplet-release.mjs "$repo" "$release"
node scripts/check-auth-config.mjs
node scripts/check-media-tools.mjs
npx prisma generate
npm run build
test -s .next/BUILD_ID
test -s .next/required-server-files.json
node - <<'NODE'
const fs = require("node:fs");
const manifest = JSON.parse(fs.readFileSync(".next/prerender-manifest.json", "utf8"));
for (const key of ["previewModeId", "previewModeSigningKey", "previewModeEncryptionKey"]) {
  if (!manifest.preview?.[key]) throw new Error(`Missing preview configuration: ${key}`);
}
NODE
# Live deployments require backward-compatible migrations. No database rollback is attempted.
npx prisma migrate deploy
node scripts/seed-help-center.mjs --bundled
node scripts/align-business-schedules.mjs
node scripts/prepare-business-timezone.mjs "$repo"
activating=1
pm2 restart "$release/release.ecosystem.json" --only megalive-portal --update-env
node scripts/prepare-droplet-release.mjs --health "$release"
pm2 save
node scripts/prepare-business-timezone.mjs "$repo" --activate
activating=0
trap - ERR
echo "Deployment healthy: $release"
echo 'Previous releases are retained for rollback; do not remove the active release.'
}
# Parse the whole function before git pull can update this script on disk.
deploy "$@"
