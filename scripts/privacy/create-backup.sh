#!/usr/bin/env bash
# Called from the configured portal checkout. Never prints the connection string.
set -euo pipefail
umask 077
backup_dir=/root/backups/portal-privacy
mkdir -p "$backup_dir"
backup_file="$backup_dir/portal-$(date -u +%Y%m%dT%H%M%SZ).dump"
node --input-type=module - "$backup_file" <<'NODE'
import {spawnSync} from 'node:child_process';
process.loadEnvFile('.env.local');
if(!process.env.DATABASE_URL)throw Error('DATABASE_URL is required');
const url=new URL(process.env.DATABASE_URL);
const connection={PGHOST:url.hostname,PGPORT:url.port||'5432',PGDATABASE:decodeURIComponent(url.pathname.slice(1)),PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),...(url.searchParams.has('sslmode')?{PGSSLMODE:url.searchParams.get('sslmode')}:{})};
const result=spawnSync('pg_dump',['--format=custom','--file',process.argv[2]],{env:{...process.env,...connection},stdio:['ignore','ignore','inherit']});
if(result.status!==0)process.exit(result.status||1);
NODE
python3 scripts/privacy/register-backup.py "$backup_file"
echo "Backup created: $backup_file"
