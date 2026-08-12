# -*- coding: utf-8 -*-
from pathlib import Path
import re

root = Path(r'c:\Sanjar\youcansmile')
font_links = (
    '  <link rel="preconnect" href="https://fonts.googleapis.com"/>\n'
    '  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>\n'
    '  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Nunito:wght@400;600;700;800&family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500&family=Inter:wght@300;400;500;600;700;800&display=swap"/>\n'
)
marker = '  <link rel="stylesheet" href="css/styles.css"/>'

for p in root.glob('*.html'):
    t = p.read_text(encoding='utf-8')
    if 'fonts.googleapis.com' not in t and marker in t:
        t = t.replace(marker, font_links + marker, 1)
    t = re.sub(
        r'<script src="([^"]+)"(?:\s+defer)?></script>',
        r'<script src="\1" defer></script>',
        t,
    )
    # drop unused heroSage3d from homepage
    if p.name == 'index.html':
        t = t.replace(
            '<script src="js/heroSage3d.js" defer></script>\n',
            '',
        )
        t = t.replace(
            'src="img/logo-ycs-purple.png"',
            'data-src="img/logo-ycs-purple.png"',
        )
    p.write_text(t, encoding='utf-8')
    print('updated', p.name)
