#!/usr/bin/env python3
"""Dry-run by default. Only prune explicitly registered portal database dumps.
Never scans for/deletes arbitrary filesystem contents or follows symlinks.
"""
import argparse,json,os,stat,time
from datetime import datetime
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--manifest',required=True);p.add_argument('--apply',action='store_true');p.add_argument('--journal');a=p.parse_args()
manifest=json.loads(Path(a.manifest).read_text());assert manifest['retentionDays']==30
# Hourly scheduling: expire within the final hour so no registered copy exceeds 30 days.
cutoff=time.time()-(30*86400-3600)
for item in manifest['files']:
 path=Path(item['path'])
 if not path.exists():continue
 info=path.lstat()
 if not stat.S_ISREG(info.st_mode) or path.resolve()!=path:raise SystemExit('Refusing non-regular or linked backup')
 if info.st_size!=item['size'] or info.st_mtime_ns!=item['mtimeNs']:raise SystemExit('Backup changed; update reviewed manifest before pruning')
 if info.st_mtime>=cutoff:continue
 print(('DELETE ' if a.apply else 'WOULD DELETE ')+str(path))
 if a.apply:os.unlink(path)

# Recovery markers contain old identifiers only until every pre-erasure dump has expired.
if a.journal:
 journal=Path(a.journal)
 if journal.exists():
  if journal.resolve()!=journal or not journal.is_dir():raise SystemExit('Invalid recovery journal directory')
  for marker in journal.glob('*.json'):
   if marker.is_symlink() or not marker.is_file():raise SystemExit('Invalid recovery marker')
   row=json.loads(marker.read_text());erased=datetime.fromisoformat(row['erasedAt'].replace('Z','+00:00')).timestamp()
   if time.time()-erased<30*86400:continue
   if any(Path(x['path']).exists() and Path(x['path']).stat().st_mtime<=erased for x in manifest['files']):continue
   print(('DELETE MARKER ' if a.apply else 'WOULD DELETE MARKER ')+marker.name)
   if a.apply:marker.unlink()
