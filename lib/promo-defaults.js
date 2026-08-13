/** Shared promo slider defaults for seed + settings merge. */
const defaults = require('./seed-defaults');

function defaultPromos() {
  const s = defaults.settings();
  return Array.isArray(s.promos) ? s.promos.map((p) => Object.assign({}, p)) : [];
}

function defaultPromoSlider() {
  const s = defaults.settings();
  return Object.assign(
    { bgMode: 'preset', preset: 'aurora', imageUrl: '', overlay: 0.35 },
    s.promoSlider || {}
  );
}

function mergePromoSettings(raw) {
  const s = raw && typeof raw === 'object' ? Object.assign({}, raw) : {};
  if (!Array.isArray(s.promos) || !s.promos.length) {
    s.promos = defaultPromos();
  }
  s.promoSlider = Object.assign({}, defaultPromoSlider(), s.promoSlider || {});
  if (!['preset', 'image'].includes(s.promoSlider.bgMode)) s.promoSlider.bgMode = 'preset';
  if (!s.promoSlider.preset) s.promoSlider.preset = 'aurora';
  const ov = Number(s.promoSlider.overlay);
  s.promoSlider.overlay = Number.isFinite(ov) ? Math.min(0.7, Math.max(0, ov)) : 0.35;
  return s;
}

module.exports = { defaultPromos, defaultPromoSlider, mergePromoSettings };
