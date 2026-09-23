const { parsePhone, isCompletePhone, isValidSocialText, normalizeSocialHandle } = require(
  require('path').resolve(process.cwd(), 'lib/phone')
);
const { getLinkByPhone } = require(require('path').resolve(process.cwd(), 'lib/telegram-verify'));

/**
 * Validate customer contact for a NEW order.
 * @returns {{ ok: true, phoneE164, parsed, link? } | { ok: false, error: string }}
 */
async function validateOrderCustomer(customer) {
  const c = customer || {};
  const phoneRaw = String(c.phone || '').trim();
  if (!isCompletePhone(phoneRaw)) {
    return { ok: false, error: 'bad_phone' };
  }
  const parsed = parsePhone(phoneRaw);
  const contact = String(c.contact || '').trim();
  const channel = String(c.contactChannel || 'telegram').toLowerCase();

  if (parsed.isUz) {
    if (!isValidSocialText(contact)) {
      return { ok: false, error: 'need_contact' };
    }
    return { ok: true, phoneE164: parsed.e164, parsed, contact: normalizeSocialHandle(contact) };
  }

  // Non-UZ: verified Telegram OR valid social text (Instagram / any handle)
  const link = await getLinkByPhone(parsed.e164);
  const socialOk = isValidSocialText(contact);
  if (!link && !socialOk) {
    return { ok: false, error: 'need_telegram_verify' };
  }
  return {
    ok: true,
    phoneE164: parsed.e164,
    parsed,
    link: link || null,
    contact: socialOk ? normalizeSocialHandle(contact) : contact,
    channel,
  };
}

function enrichCustomer(customer, validation) {
  const c = Object.assign({}, customer || {});
  c.phone = validation.phoneE164 ? `+${validation.phoneE164}` : c.phone;
  if (validation.contact) c.contact = validation.contact;
  if (validation.link) {
    c.telegramId = String(validation.link.telegram_id);
    if (validation.link.telegram_username) {
      c.telegramUsername = validation.link.telegram_username;
      if (!c.contact && validation.link.telegram_username) {
        c.contact = '@' + String(validation.link.telegram_username).replace(/^@/, '');
        c.contactChannel = c.contactChannel || 'telegram';
      }
    }
    c.telegramVerified = true;
  }
  return c;
}

module.exports = { validateOrderCustomer, enrichCustomer };
