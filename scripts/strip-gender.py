from pathlib import Path
import re

root = Path(r'c:\Sanjar\youcansmile')
for rel in ['lib/seed-defaults.js', 'js/api.js']:
    p = root / rel
    t = p.read_text(encoding='utf-8')
    t2 = re.sub(r",\s*gender:\s*'(?:unisex|male|female)'", '', t)
    p.write_text(t2, encoding='utf-8')
    print(rel, 'ok' if t != t2 else 'no-change')
