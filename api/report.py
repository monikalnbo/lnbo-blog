#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""博客访客统计报告 —— 用法: python3 report.py [天数]"""
import sys, collections
from datetime import datetime, timedelta

LOG = '/www/wwwlogs/visitors.log'
days = int(sys.argv[1]) if len(sys.argv) > 1 else 30

visits = collections.defaultdict(lambda: {'pv': 0, 'pages': set(), 'first': None,
                                          'last': None, 'ip': set(), 'ua': set()})
total_pv = 0

for line in open(LOG, encoding='utf-8', errors='ignore'):
    parts = line.rstrip('\n').split('|')
    if len(parts) < 6:
        continue
    ts, vid, path, ref, ip, ua = parts[:6]
    t = datetime.fromisoformat(ts)
    if (datetime.now(tz=t.tzinfo) - t).days >= days:
        continue
    total_pv += 1
    v = visits[vid]
    v['pv'] += 1
    v['pages'].add(path)
    v['ip'].add(ip)
    v['ua'].add(ua[:60])
    v['first'] = min(v['first'], t) if v['first'] else t
    v['last'] = max(v['last'], t) if v['last'] else t

print(f"═" * 62)
print(f" 博客访客报告（近 {days} 天）")
print(f"═" * 62)
print(f" 总浏览量 PV: {total_pv}   |   独立访客 UV: {len(visits)}")
print()
for vid, v in sorted(visits.items(), key=lambda x: -x[1]['pv']):
    print(f"🆔 {vid}")
    print(f"   浏览 {v['pv']} 页 | 访问页面: {', '.join(sorted(v['pages'])) or '-'}")
    print(f"   首次: {v['first']:%m-%d %H:%M} | 最近: {v['last']:%m-%d %H:%M} | IP: {', '.join(v['ip'])}")
    print(f"   设备: {list(v['ua'])[0]}")
    print()
