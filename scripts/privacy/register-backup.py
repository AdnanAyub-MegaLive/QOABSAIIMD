#!/usr/bin/env python3
"""Register one newly created portal dump for the approved 30-day policy."""
import argparse,json,os,stat,fcntl,tempfile
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('backup');p.add_argument('--manifest',default='/etc/megalive/backup-retention.json');a=p.parse_args()
path=Path(a.backup)
if not path.is_absolute() or path.resolve()!=path or not stat.S_ISREG(path.lstat().st_mode):raise SystemExit('Use a regular, absolute backup path')
with path.open('rb') as file:
 if file.read(5)!=b'PGDMP':raise SystemExit('Only a PostgreSQL custom-format dump can be registered')
manifest=Path(a.manifest)
with open(str(manifest)+'.lock','a') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 data=json.loads(manifest.read_text())
 if data.get('retentionDays')!=30:raise SystemExit('Unexpected retention policy')
 info=path.stat();row={'path':str(path),'size':info.st_size,'mtimeNs':info.st_mtime_ns}
 data['files']=[x for x in data['files'] if x['path']!=str(path)]+[row]
 fd,temp=tempfile.mkstemp(dir=manifest.parent,prefix='.backup-policy-')
 try:
  with os.fdopen(fd,'w') as out:json.dump(data,out);out.flush();os.fsync(out.fileno())
  os.replace(temp,manifest)
 finally:
  if os.path.exists(temp):os.unlink(temp)
 print('Portal backup registered for 30-day expiry.')
