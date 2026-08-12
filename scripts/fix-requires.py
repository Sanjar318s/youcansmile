import re
from pathlib import Path

root = Path("server/handlers")
for p in root.rglob("*.js"):
    text = p.read_text(encoding="utf-8")

    def repl(m):
        mod = m.group(1)
        return "require(require('path').resolve(process.cwd(), 'lib/%s'))" % mod

    new = re.sub(r"require\(['\"](?:\.\./)+lib/([^'\"]+)['\"]\)", repl, text)
    if new != text:
        p.write_text(new, encoding="utf-8")
        print("fixed", p)
print("done")
