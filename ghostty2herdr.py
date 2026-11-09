# 用法: ghostty2herdr.py <ghostty 主题文件> <输出 json> [覆盖顶层字段的 json，如 selection、colors]
import json, sys
src, out = sys.argv[1], sys.argv[2]
kv, ansi = {}, [None] * 16
for line in open(src):
    line = line.split('#', 1)[0] if not line.strip().startswith(('palette', 'background', 'foreground', 'cursor', 'selection')) else line
    if '=' not in line: continue
    k, v = (s.strip() for s in line.split('=', 1))
    if k == 'palette':
        i, c = v.split('=', 1); ansi[int(i)] = c.strip().lower()
    else:
        kv[k] = v.lower()
assert all(ansi), f'palette 不全: {ansi}'
t = {"background": kv['background'], "foreground": kv['foreground'],
     "selection": kv['selection-background'], "ansi": ansi}
if 'cursor-color' in kv: t["cursor"] = kv['cursor-color']
if len(sys.argv) > 3: t.update(json.loads(sys.argv[3]))
json.dump(t, open(out, 'w'), indent=2); open(out, 'a').write('\n')
