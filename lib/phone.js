/**
 * Shared phone country rules + parsing (server).
 * Keep in sync with js/phone.js
 */

const COUNTRIES = [
  { code: 'UZ', dial: '998', nationalLen: 9, label: 'UZ +998', mask: 'XX XXX XX XX' },
  { code: 'RU', dial: '7', nationalLen: 10, label: 'RU +7', mask: 'XXX XXX XX XX' },
  { code: 'KZ', dial: '7', nationalLen: 10, label: 'KZ +7', mask: 'XXX XXX XX XX' },
  { code: 'TJ', dial: '992', nationalLen: 9, label: 'TJ +992', mask: 'XX XXX XX XX' },
  { code: 'KG', dial: '996', nationalLen: 9, label: 'KG +996', mask: 'XXX XXX XXX' },
  { code: 'TM', dial: '993', nationalLen: 8, label: 'TM +993', mask: 'XX XXXXXX' },
  { code: 'TR', dial: '90', nationalLen: 10, label: 'TR +90', mask: 'XXX XXX XX XX' },
  { code: 'AE', dial: '971', nationalLen: 9, label: 'AE +971', mask: 'XX XXX XXXX' },
  { code: 'US', dial: '1', nationalLen: 10, label: 'US +1', mask: 'XXX XXX XXXX' },
];

const DEFAULT_COUNTRY = 'UZ';

const JUNK_SOCIAL = /^(нет|нету|нету|нет\.|no|none|n\/a|na|-|—|–|\.|…|хз|без|нету телеграм|нет телеграм|нет инст|null|undefined)$/i;

function countryByCode(code) {
  return COUNTRIES.find((c) => c.code === code) || COUNTRIES.find((c) => c.code === DEFAULT_COUNTRY);
}

function countryByDial(dial, preferCode) {
  const d = String(dial || '');
  const matches = COUNTRIES.filter((c) => c.dial === d);
  if (!matches.length) return null;
  if (preferCode) {
    const pref = matches.find((c) => c.code === preferCode);
    if (pref) return pref;
  }
  return matches[0];
}

function digitsOnly(s) {
  return String(s || '').replace(/\D/g, '');
}

/** Apply mask pattern (X = digit) to national digits */
function applyMask(national, mask) {
  const digits = digitsOnly(national);
  let out = '';
  let di = 0;
  for (let i = 0; i < mask.length && di < digits.length; i++) {
    if (mask[i] === 'X') {
      out += digits[di++];
    } else {
      out += mask[i];
      // if next chars are separators and we still have digits, keep going
    }
  }
  return out;
}

function formatDisplay(country, nationalDigits) {
  const c = typeof country === 'string' ? countryByCode(country) : country;
  if (!c) return '+' + digitsOnly(nationalDigits);
  const nat = digitsOnly(nationalDigits).slice(0, c.nationalLen);
  const masked = applyMask(nat, c.mask);
  return `+${c.dial}${masked ? ' ' + masked : ''}`;
}

/**
 * Parse free-form or masked phone into structured result.
 * @param {string} input
 * @param {{ countryCode?: string }} opts
 */
function parsePhone(input, opts = {}) {
  let prefer = opts.countryCode || DEFAULT_COUNTRY;
  let raw = String(input || '').trim();
  let digits = digitsOnly(raw);

  // Strip leading 00
  if (digits.startsWith('00')) digits = digits.slice(2);

  let country = countryByCode(prefer);
  let national = '';

  // Longest dial match first
  const dials = [...new Set(COUNTRIES.map((c) => c.dial))].sort((a, b) => b.length - a.length);
  let matchedDial = null;
  for (const d of dials) {
    if (digits.startsWith(d)) {
      matchedDial = d;
      break;
    }
  }

  if (matchedDial) {
    const byDial = countryByDial(matchedDial, prefer);
    if (byDial) country = byDial;
    national = digits.slice(matchedDial.length).slice(0, country.nationalLen);
  } else if (digits.length) {
    // Assume national digits for preferred country
    national = digits.slice(0, country.nationalLen);
  }

  const complete = national.length === country.nationalLen;
  const e164 = complete ? `${country.dial}${national}` : '';
  const display = formatDisplay(country, national);

  return {
    countryCode: country.code,
    dial: country.dial,
    national,
    e164,
    digits: country.dial + national,
    display,
    complete,
    isUz: country.code === 'UZ',
    country,
  };
}

/** Full E.164 digits for new writes (no leading +). Incomplete → ''. */
function normPhoneE164(phone, opts) {
  const p = parsePhone(phone, opts);
  return p.complete ? p.e164 : '';
}

/**
 * Compat lookup key: prefer full E.164; also return legacy last-9 for old rows.
 */
function phoneLookupKeys(phone) {
  const digits = digitsOnly(phone);
  const e164 = normPhoneE164(phone);
  const keys = new Set();
  if (e164) keys.add(e164);
  if (digits.length >= 9) keys.add(digits.slice(-9));
  if (digits.length >= 10) keys.add(digits);
  // Russian 8… → 7…
  if (digits.length === 11 && digits.startsWith('8')) keys.add('7' + digits.slice(1));
  return [...keys];
}

function isCompletePhone(phone, opts) {
  return parsePhone(phone, opts).complete;
}

function isJunkSocial(raw) {
  const s = String(raw || '').trim();
  if (!s) return true;
  if (JUNK_SOCIAL.test(s)) return true;
  if (/^нет\b/i.test(s) && s.length < 12) return true;
  return false;
}

/** Normalize Instagram/Telegram handle or URL to bare username (or full URL kept if unknown). */
function normalizeSocialHandle(raw) {
  let s = String(raw || '').trim();
  if (!s || isJunkSocial(s)) return '';
  s = s.replace(/^@+/, '');
  const ig = s.match(/instagram\.com\/([^/?#]+)/i);
  if (ig) return ig[1].replace(/\/$/, '');
  const tg = s.match(/(?:t\.me|telegram\.me)\/([^/?#]+)/i);
  if (tg) return tg[1].replace(/\/$/, '');
  // username-like
  if (/^[A-Za-z0-9._]{2,32}$/.test(s)) return s;
  if (/^https?:\/\//i.test(s) && s.length >= 12) return s;
  return s.length >= 3 ? s : '';
}

function isValidSocialText(raw) {
  if (isJunkSocial(raw)) return false;
  return !!normalizeSocialHandle(raw);
}

module.exports = {
  COUNTRIES,
  DEFAULT_COUNTRY,
  countryByCode,
  countryByDial,
  parsePhone,
  formatDisplay,
  applyMask,
  normPhoneE164,
  phoneLookupKeys,
  isCompletePhone,
  isJunkSocial,
  normalizeSocialHandle,
  isValidSocialText,
  digitsOnly,
};
