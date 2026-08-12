const {
  getProducts,
  saveProduct,
  saveCategory,
  saveSettings,
  getSettings,
} = require('./data');
const defaults = require('./seed-defaults');
const { ensureCustomerSchema } = require('./db');

let seededOk = false;

async function ensureSeeded() {
  await ensureCustomerSchema();
  if (seededOk) return;
  const existing = await getSettings();
  if (existing) {
    seededOk = true;
    return;
  }
  for (const c of defaults.categories()) await saveCategory(c);
  for (const p of defaults.products()) await saveProduct(p);
  await saveSettings(defaults.settings());
  seededOk = true;
}

module.exports = { ensureSeeded };
