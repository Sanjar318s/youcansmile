const { cors, json, readBody } = require(require('path').resolve(process.cwd(), 'lib/http'));
const { getSessionUser } = require(require('path').resolve(process.cwd(), 'lib/auth'));
const { parsePhone, isCompletePhone } = require(require('path').resolve(process.cwd(), 'lib/phone'));
const { createVerifyToken, getLinkByPhone } = require(require('path').resolve(process.cwd(), 'lib/telegram-verify'));
const { getSettings } = require(require('path').resolve(process.cwd(), 'lib/data'));

function botUsernameFromEnv(settings) {
  const fromEnv = String(process.env.TELEGRAM_BOT_USERNAME || '').replace(/^@/, '').trim();
  if (fromEnv) return fromEnv;
  const fromSettings = String((settings && settings.telegramBotUsername) || '').replace(/^@/, '').trim();
  return fromSettings || '';
}

async function resolveBotUsername(settings) {
  let name = botUsernameFromEnv(settings);
  if (name) return name;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return '';
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/getMe`).then((x) => x.json());
    name = String((r.result && r.result.username) || '').replace(/^@/, '');
  } catch (_) {}
  return name;
}

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return json(res, 405, { error: 'method' });
  try {
    const me = await getSessionUser(req);
    if (!me || me.role !== 'customer') return json(res, 401, { error: 'auth' });
    const body = (await readBody(req)) || {};
    const phone = String(body.phone || '').trim();
    if (!isCompletePhone(phone)) return json(res, 400, { error: 'bad_phone' });
    const parsed = parsePhone(phone);
    if (parsed.isUz) {
      return json(res, 400, { error: 'uz_no_verify', message: 'Uzbek numbers do not require Telegram verify' });
    }
    const existing = await getLinkByPhone(parsed.e164);
    if (existing) {
      return json(res, 200, {
        ok: true,
        alreadyVerified: true,
        verified: true,
        telegramUsername: existing.telegram_username || '',
        phoneE164: parsed.e164,
      });
    }
    const settings = (await getSettings().catch(() => null)) || {};
    const botUser = await resolveBotUsername(settings);
    if (!botUser) return json(res, 500, { error: 'bot_username_missing' });
    const { token, phoneE164, expiresAt } = await createVerifyToken({
      phone: parsed.e164,
      customerId: me.id,
    });
    const deepLink = `https://t.me/${botUser}?start=v_${token}`;
    return json(res, 200, {
      ok: true,
      token,
      deepLink,
      phoneE164,
      expiresAt,
      verified: false,
    });
  } catch (e) {
    return json(res, 500, { error: e.code || e.message });
  }
};
