/* ============================================================
   YouCanSmile — apply appearance / ui text overrides from settings
   ============================================================ */
const ThemeApply = (() => {
  let cachedSettings = null;

  function setVar(el, name, value) {
    if (!value) return;
    el.style.setProperty(name, value);
  }

  function run(settings) {
    cachedSettings = settings || cachedSettings;
    const s = cachedSettings;
    if (!s) return;

    const root = document.documentElement;
    const colors = (s.appearance && s.appearance.colors) || {};
    [
      '--accent', '--accent-dark', '--header-bg', '--bg', '--purple', '--purple-deep',
      '--price', '--accent-soft', '--glow', '--glow-soft',
    ].forEach((name) => root.style.removeProperty(name));

    setVar(root, '--accent', colors.accent);
    setVar(root, '--accent-dark', colors.accentDark);
    setVar(root, '--header-bg', colors.headerBg);
    setVar(root, '--bg', colors.pageBg);
    if (colors.accent) setVar(root, '--purple', colors.accent);
    if (colors.accentDark) setVar(root, '--purple-deep', colors.accentDark);
    if (colors.accent) setVar(root, '--price', colors.accent);
    if (colors.accent) {
      root.style.setProperty('--accent-soft', hexToRgba(colors.accent, 0.16));
      root.style.setProperty('--glow', `0 0 24px ${hexToRgba(colors.accent, 0.45)}`);
      root.style.setProperty('--glow-soft', `0 12px 30px ${hexToRgba(colors.accent, 0.22)}`);
    }

    let styleEl = document.getElementById('ycs-appearance-style');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'ycs-appearance-style';
      document.head.appendChild(styleEl);
    }

    const rules = [];
    if (colors.primaryText) {
      rules.push(`.btn-primary { color: ${colors.primaryText} !important; }`);
    }
    if (colors.secondaryBg || colors.secondaryBorder || colors.secondaryText) {
      rules.push(`.btn-secondary {
        ${colors.secondaryBg ? `background: ${colors.secondaryBg} !important;` : ''}
        ${colors.secondaryBorder ? `border-color: ${colors.secondaryBorder} !important;` : ''}
        ${colors.secondaryText ? `color: ${colors.secondaryText} !important;` : ''}
      }`);
    }

    const wallpaper = s.appearance && s.appearance.wallpaper;
    if (wallpaper) {
      rules.push(`body {
        background-image: linear-gradient(rgba(7,4,15,0.55), rgba(7,4,15,0.55)), url("${cssUrl(wallpaper)}") !important;
        background-size: cover !important;
        background-position: center !important;
        background-attachment: fixed !important;
      }
      html:not([data-theme='purple']) body {
        background-image: linear-gradient(rgba(246,241,227,0.72), rgba(246,241,227,0.72)), url("${cssUrl(wallpaper)}") !important;
      }`);
    }

    styleEl.textContent = rules.join('\n');
  }

  function cssUrl(u) {
    return String(u).replace(/\\/g, '/').replace(/"/g, '\\"');
  }

  function hexToRgba(hex, a) {
    const h = String(hex || '').replace('#', '');
    if (h.length !== 6) return `rgba(168,85,247,${a})`;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }

  function textOverride(key, lang) {
    const s = cachedSettings;
    if (!s || !s.uiTexts || !s.uiTexts[key]) return '';
    const pack = s.uiTexts[key];
    if (typeof pack === 'string') return pack;
    return (pack && (pack[lang] || pack.ru || pack.en || pack.uz)) || '';
  }

  function icon(name, fallback) {
    const s = cachedSettings;
    const v = s && s.uiIcons && s.uiIcons[name];
    return (v && String(v).trim()) || fallback;
  }

  function decorate() {
    const custom = icon('customOrder', '');
    if (!custom) return;
    document.querySelectorAll('[data-i18n="sage_hero_custom"]').forEach((el) => {
      if (el.dataset.ycsIcon) return;
      el.dataset.ycsIcon = '1';
      el.prepend(document.createTextNode(custom + ' '));
    });
  }

  function setSettings(s) {
    cachedSettings = s;
  }

  return { run, textOverride, icon, decorate, setSettings, get settings() { return cachedSettings; } };
})();
