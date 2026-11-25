#!/usr/bin/env python3
"""Read nginx timing logs from stdin; output aggregates without URLs or identities."""
import collections
import datetime
import json
import pathlib
import re
import sys

root = pathlib.Path(__file__).resolve().parents[2] / 'src' / 'app'
routes = []
for file in root.rglob('route.*'):
    if file.suffix not in {'.js', '.ts', '.jsx', '.tsx'}:
        continue
    parts = [p for p in file.parent.relative_to(root).parts if not p.startswith(('(', '@'))]
    pattern = ''.join('(?:/.*)?' if p.startswith('[[...') else '/.+' if p.startswith('[...') else '/[^/]+' if p.startswith('[') else '/' + re.escape(p) for p in parts)
    routes.append((sum(not p.startswith('[') for p in parts), re.compile('^' + pattern + '/?$'), '/' + '/'.join(parts)))
routes.sort(key=lambda r: -r[0])
bounds = [.01, .05, .1, .25, .5, 1, 2, 4, 8, 30, 60]
groups = {}
first = last = None
untimed = malformed = 0

def observe(item, key, value):
    values = item.setdefault(key, {'count': 0, 'sumSeconds': 0, 'maxSeconds': 0, 'buckets': [0] * (len(bounds) + 1)})
    values['count'] += 1
    values['sumSeconds'] += value
    values['maxSeconds'] = max(values['maxSeconds'], value)
    values['buckets'][next((i for i, b in enumerate(bounds) if value <= b), len(bounds))] += 1

for line in sys.stdin:
    if ' rt=' not in line:
        untimed += 1
        continue
    try:
        quoted = line.split('"')
        method, raw_path, _ = quoted[1].split()
        path = raw_path.split('?', 1)[0]
        status, size = quoted[2].split()[:2]
        status = int(status)
        duration = float(line.rsplit(' rt=', 1)[1].split()[0])
        upstream = line.rsplit(' urt=', 1)[1].split()[0].strip('"')
        timestamp = datetime.datetime.strptime(line.split('[', 1)[1].split(']', 1)[0], '%d/%b/%Y:%H:%M:%S %z').astimezone(datetime.timezone.utc)
        first = timestamp if first is None else min(first, timestamp)
        last = timestamp if last is None else max(last, timestamp)
        route = next((label for _, pattern, label in routes if pattern.fullmatch(path)), '/unknown')
        # Socket connections/long polls are excluded from API request latency.
        category = 'socket' if path.startswith('/socket.io') else 'media' if path.startswith('/api/uploads/') or path.endswith(('/cover', '/file', '/poster')) or path.startswith(('/uploads/', '/media/')) else 'api' if path.startswith('/api/') else 'web'
        if category == 'socket':
            route = '/socket.io'
        if method not in {'GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'}:
            method = 'OTHER'
        key = '|'.join([timestamp.strftime('%Y-%m-%dT%H:00Z'), category, method, route])
        item = groups.setdefault(key, {'statuses': {}, 'bytes': 0})
        item['statuses'][str(status)] = item['statuses'].get(str(status), 0) + 1
        item['bytes'] += int(size) if size.isdecimal() else 0
        observe(item, 'request', duration)
        if re.fullmatch(r'\d+(?:\.\d+)?', upstream):
            observe(item, 'upstream', float(upstream))
    except (ValueError, IndexError):
        malformed += 1

print(json.dumps({'firstUtc': first.isoformat() if first else None, 'lastUtc': last.isoformat() if last else None, 'untimedLines': untimed, 'malformedLines': malformed, 'bucketUpperSeconds': bounds + [None], 'groups': groups}, indent=2))
