/* YouCanSmile — smart phone mask (sync with lib/phone.js) */
(function (global) {
  var COUNTRIES = [
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
  var DEFAULT_COUNTRY = 'UZ';
  var JUNK_SOCIAL = /^(нет|нету|нет\.|no|none|n\/a|na|-|—|–|\.|…|хз|без|null|undefined)$/i;

  function countryByCode(code) {
    return COUNTRIES.find(function (c) { return c.code === code; }) || COUNTRIES.find(function (c) { return c.code === DEFAULT_COUNTRY; });
  }
  function countryByDial(dial, preferCode) {
    var matches = COUNTRIES.filter(function (c) { return c.dial === dial; });
    if (!matches.length) return null;
    if (preferCode) {
      var pref = matches.find(function (c) { return c.code === preferCode; });
      if (pref) return pref;
    }
    return matches[0];
  }
  function digitsOnly(s) { return String(s || '').replace(/\D/g, ''); }
  function applyMask(national, mask) {
    var digits = digitsOnly(national);
    var out = '';
    var di = 0;
    for (var i = 0; i < mask.length && di < digits.length; i++) {
      if (mask[i] === 'X') out += digits[di++];
      else out += mask[i];
    }
    return out;
  }
  function formatDisplay(country, nationalDigits) {
    var c = typeof country === 'string' ? countryByCode(country) : country;
    if (!c) return '+' + digitsOnly(nationalDigits);
    var nat = digitsOnly(nationalDigits).slice(0, c.nationalLen);
    var masked = applyMask(nat, c.mask);
    return '+' + c.dial + (masked ? ' ' + masked : '');
  }
  function parsePhone(input, opts) {
    opts = opts || {};
    var prefer = opts.countryCode || DEFAULT_COUNTRY;
    var digits = digitsOnly(input);
    if (digits.indexOf('00') === 0) digits = digits.slice(2);
    var country = countryByCode(prefer);
    var national = '';
    var dials = [];
    var seen = {};
    COUNTRIES.forEach(function (c) {
      if (!seen[c.dial]) { seen[c.dial] = 1; dials.push(c.dial); }
    });
    dials.sort(function (a, b) { return b.length - a.length; });
    var matchedDial = null;
    for (var i = 0; i < dials.length; i++) {
      if (digits.indexOf(dials[i]) === 0) { matchedDial = dials[i]; break; }
    }
    if (matchedDial) {
      var byDial = countryByDial(matchedDial, prefer);
      if (byDial) country = byDial;
      national = digits.slice(matchedDial.length).slice(0, country.nationalLen);
    } else if (digits.length) {
      national = digits.slice(0, country.nationalLen);
    }
    var complete = national.length === country.nationalLen;
    var e164 = complete ? country.dial + national : '';
    return {
      countryCode: country.code,
      dial: country.dial,
      national: national,
      e164: e164,
      digits: country.dial + national,
      display: formatDisplay(country, national),
      complete: complete,
      isUz: country.code === 'UZ',
      country: country,
    };
  }
  function isJunkSocial(raw) {
    var s = String(raw || '').trim();
    if (!s) return true;
    if (JUNK_SOCIAL.test(s)) return true;
    if (/^нет\b/i.test(s) && s.length < 12) return true;
    return false;
  }
  function normalizeSocialHandle(raw) {
    var s = String(raw || '').trim();
    if (!s || isJunkSocial(s)) return '';
    s = s.replace(/^@+/, '');
    var ig = s.match(/instagram\.com\/([^/?#]+)/i);
    if (ig) return ig[1].replace(/\/$/, '');
    var tg = s.match(/(?:t\.me|telegram\.me)\/([^/?#]+)/i);
    if (tg) return tg[1].replace(/\/$/, '');
    if (/^[A-Za-z0-9._]{2,32}$/.test(s)) return s;
    if (/^https?:\/\//i.test(s) && s.length >= 12) return s;
    return s.length >= 3 ? s : '';
  }
  function isValidSocialText(raw) {
    return !isJunkSocial(raw) && !!normalizeSocialHandle(raw);
  }
  function bind(inputEl, options) {
    options = options || {};
    if (!inputEl) return null;
    var countryCode = options.countryCode || DEFAULT_COUNTRY;
    var onChange = typeof options.onChange === 'function' ? options.onChange : null;
    var selectEl = null;
    if (options.withCountrySelect !== false) {
      var wrap = document.createElement('div');
      wrap.className = 'phone-field-wrap';
      var parent = inputEl.parentNode;
      parent.insertBefore(wrap, inputEl);
      selectEl = document.createElement('select');
      selectEl.className = 'phone-country-select';
      selectEl.setAttribute('aria-label', 'Country code');
      COUNTRIES.forEach(function (c) {
        var opt = document.createElement('option');
        opt.value = c.code;
        opt.textContent = c.label;
        if (c.code === countryCode) opt.selected = true;
        selectEl.appendChild(opt);
      });
      wrap.appendChild(selectEl);
      wrap.appendChild(inputEl);
      inputEl.classList.add('phone-national-input');
      selectEl.addEventListener('change', function () {
        countryCode = selectEl.value;
        var cur = parsePhone(inputEl.value, { countryCode: countryCode });
        var nat = cur.national.slice(0, countryByCode(countryCode).nationalLen);
        inputEl.value = formatDisplay(countryCode, nat);
        emit();
      });
    }
    function emit() {
      var parsed = parsePhone(inputEl.value, { countryCode: countryCode });
      countryCode = parsed.countryCode;
      if (selectEl && selectEl.value !== countryCode) selectEl.value = countryCode;
      if (onChange) onChange(parsed);
      return parsed;
    }
    function onInput() {
      var before = inputEl.value;
      var parsed = parsePhone(before, { countryCode: countryCode });
      countryCode = parsed.countryCode;
      var next = formatDisplay(parsed.country, parsed.national);
      if (next !== before) inputEl.value = next;
      emit();
    }
    function onPaste(e) {
      e.preventDefault();
      var text = (e.clipboardData || window.clipboardData).getData('text');
      var parsed = parsePhone(text, { countryCode: countryCode });
      countryCode = parsed.countryCode;
      inputEl.value = formatDisplay(parsed.country, parsed.national);
      emit();
    }
    var initial = parsePhone(inputEl.value || '', { countryCode: countryCode });
    countryCode = initial.countryCode || countryCode;
    if (selectEl) selectEl.value = countryCode;
    if (!digitsOnly(inputEl.value)) inputEl.value = formatDisplay(countryCode, '');
    else inputEl.value = formatDisplay(initial.country, initial.national);
    inputEl.setAttribute('inputmode', 'tel');
    inputEl.setAttribute('autocomplete', 'tel');
    inputEl.addEventListener('input', onInput);
    inputEl.addEventListener('paste', onPaste);
    inputEl.addEventListener('blur', onInput);
    emit();
    return {
      getParsed: function () { return parsePhone(inputEl.value, { countryCode: countryCode }); },
      setValue: function (phone) {
        var p = parsePhone(phone || '', { countryCode: countryCode });
        countryCode = p.countryCode;
        if (selectEl) selectEl.value = countryCode;
        inputEl.value = formatDisplay(p.country, p.national);
        emit();
      },
      setCountry: function (code) {
        countryCode = code;
        if (selectEl) selectEl.value = code;
        var p = parsePhone(inputEl.value, { countryCode: code });
        inputEl.value = formatDisplay(code, p.national.slice(0, countryByCode(code).nationalLen));
        emit();
      },
      destroy: function () {
        inputEl.removeEventListener('input', onInput);
        inputEl.removeEventListener('paste', onPaste);
        inputEl.removeEventListener('blur', onInput);
      },
    };
  }
  global.Phone = {
    COUNTRIES: COUNTRIES,
    DEFAULT_COUNTRY: DEFAULT_COUNTRY,
    parsePhone: parsePhone,
    formatDisplay: formatDisplay,
    isJunkSocial: isJunkSocial,
    normalizeSocialHandle: normalizeSocialHandle,
    isValidSocialText: isValidSocialText,
    bind: bind,
  };
})(typeof window !== 'undefined' ? window : globalThis);
