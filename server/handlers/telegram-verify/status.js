const { cors, json } = require(require('path').resolve(process.cwd(), 'lib/http'));
const { getSessionUser } = require(require('path').resolve(process.cwd(), 'lib/auth'));
const { parsePhone, isCompletePhone } = require(require('path').resolve(process.cwd(), 'lib/phone'));
const { getLinkByPhone } = require(require('path').resolve(process.cwd(), 'lib/telegram-verify'));

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'GET') return json(res, 405, { error: 'method' });
  try {
    const me = await getSessionUser(req);
    if (!me || me.role !== 'customer') return json(res, 401, { error: 'auth' });
    const phone = String(req.query.phone || '').trim();
    if (!phone || !isCompletePhone(phone)) {
      return json(res, 200, { verified: false, error: 'bad_phone' });
    }
    const parsed = parsePhone(phone);
    const link = await getLinkByPhone(parsed.e164 || phone);
    if (!link) return json(res, 200, { verified: false, phoneE164: parsed.e164 });
    return json(res, 200, {
      verified: true,
      phoneE164: link.phone_e164,
      telegramId: link.telegram_id,
      telegramUsername: link.telegram_username || '',
      verifiedAt: link.verified_at,
    });
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
};
