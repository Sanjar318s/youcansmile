const { getDb } = require('./db');
const {
  getProducts,
  saveProduct,
  saveCategory,
  saveSettings,
  getSettings,
} = require('./data');
const defaults = require('./seed-defaults');

async function ensureSeeded() {
  const existing = await getSettings();
  if (existing) return;
  for (const c of defaults.categories()) await saveCategory(c);
  for (const p of defaults.products()) await saveProduct(p);
  await saveSettings(defaults.settings());
}

module.exports = { ensureSeeded };

