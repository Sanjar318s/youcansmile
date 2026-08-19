const { getSessionUser } = require('./auth');
const { json } = require('./http');
const { mergePromoSettings } = require('./promo-defaults');

async function requireAdmin(req, res) {
  const me = await getSessionUser(req);
  if (!me || me.role !== 'admin') {
    json(res, 401, { error: 'auth' });
    return null;
  }
  return me;
}

/** Strip secrets from settings for public storefront clients. */
function publicSettings(raw) {
  const s = mergePromoSettings(raw || {});
  const out = Object.assign({}, s);
  delete out.adminPassword;
  delete out.telegramSellers;
  delete out.telegramSellerChatId;
  return out;
}

module.exports = { requireAdmin, publicSettings };
