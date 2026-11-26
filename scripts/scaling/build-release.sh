#!/usr/bin/env bash
set -euo pipefail
umask 077
repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo"
test -z "$(git status --porcelain --untracked-files=no)"
test -f .env.local
mkdir -p "${repo}-releases"
exec 9>"${repo}-releases/deploy.lock"
flock -n 9
release="$(mktemp -d "${repo}-releases/$(git rev-parse --short HEAD)-scaled-XXXXXX")"
git archive HEAD | tar -x -C "$release"
pm2 jlist > "$release/pm2-before.json"
for file in .env .env.local .env.production .env.production.local; do
  if [ -f "$repo/$file" ]; then ln -s "$repo/$file" "$release/$file"; fi
done
mkdir -p "$repo/storage"
if [ -d "$release/storage" ]; then mv "$release/storage" "$release/storage-bundled"; fi
ln -s "$repo/storage" "$release/storage"
cd "$release"
npm ci --include=dev
node scripts/prepare-business-timezone.mjs "$repo"
node scripts/prepare-droplet-release.mjs "$repo" "$release"
node scripts/check-auth-config.mjs
node scripts/check-media-tools.mjs
npx prisma generate
export PORTAL_DEPLOYMENT_ID="$(basename "$release")"
npm run build -- --webpack
test -s .next/BUILD_ID
test -s .next/required-server-files.json
# Scaling changes intentionally introduce no application-schema migration.
# Refuse a build with pending migrations; use the reviewed migration workflow first.
npx prisma migrate status
printf '%s\n' "$release" > "${repo}-releases/scaled-candidate"
echo "Prepared release: $release (traffic unchanged)"
