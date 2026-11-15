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
const result=spawnSync('pg_dump',['--format=custom','--file',process.argv[2]],{env:{...process.env,PGDATABASE:process.env.DATABASE_URL},stdio:['ignore','ignore','inherit']});
if(result.status!==0)process.exit(result.status||1);
NODE
python3 scripts/privacy/register-backup.py "$backup_file"
echo "Backup created: $backup_file"
