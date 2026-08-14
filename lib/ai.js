const { orderNumberLabel } = require('./orders');
const { getProducts, getCategories, getSettings } = require('./data');
const { mergePromoSettings } = require('./promo-defaults');

const STATUS_LABELS = {
  new: 'Новый',
  processing: 'Обрабатывается',
  contacting: 'Скоро свяжется',
  in_progress: 'В процессе',
  done: 'Завершён',
  cancelled: 'Отменён',
};

const MAX_KB_PRODUCTS = 60;
const MAX_KB_HISTORY = 10;

function txt(obj, lang = 'ru') {
  if (!obj) return '';
  if (typeof obj === 'string') return obj;
  return obj[lang] || obj.ru || obj.en || obj.uz || Object.values(obj)[0] || '';
}

function normalizeText(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordsOf(s) {
  return normalizeText(s)
    .split(' ')
    .filter(Boolean)
    .map((w) => softStem(w));
}

/* Soft stem for RU product search: медузой → медуз, брелочками → брелочк */
function softStem(w) {
  const s = String(w || '');
  if (s.length < 5) return s;
  const cut = s.replace(/(ами|ями|ой|ей|ом|ем|ах|ях|ов|ев|ий|ый|ая|ое|ые|ие|ую|юю|ами|ами)$/i, '');
  if (cut.length >= 4) return cut;
  return s.slice(0, Math.max(4, s.length - 2));
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function sharedPrefixLen(a, b) {
  let n = 0;
  const max = Math.min(a.length, b.length);
  while (n < max && a[n] === b[n]) n++;
  return n;
}

/* ------------------------------------------------------------------
   Deterministic fast path #1: ТОЛЬКО статус заказа.
   ------------------------------------------------------------------ */

const ORDER_STATUS_RE =
  /статус|order status|где\s*(мо[йя]\s*)?заказ|buyurtma\s*(raqami|holati)/i;

function ruleBasedReply(text, orders, settings) {
  const q = String(text || '').toLowerCase();
  if (!ORDER_STATUS_RE.test(q)) return { answer: null, escalate: false };
  const latest = orders[0];
  if (!latest) {
    return {
      answer:
        'У вас пока нет заказов на сайте. Оформите заказ в каталоге или напишите «позвать продавца».',
      escalate: false,
    };
  }
  const st = STATUS_LABELS[latest.status] || latest.status;
  return {
    answer: `Ваш последний заказ — ${orderNumberLabel(latest, 'ru')} — статус: «${st}».`,
    escalate: false,
  };
}

/* ------------------------------------------------------------------
   Deterministic fast path #2: поиск товаров по каталогу.
   Отвечает строго по данным сайта и возвращает карточки товаров.
   ------------------------------------------------------------------ */

const PRODUCT_INTENT_RE =
  /в наличии|наличие|есть ли|есть(?!\p{L})|сколько стоит|цена|ценник|доступн|купить|куплю|заказать|оформить|оформл|хочу(?!\p{L})|ищу|нужн|посовету|подскажи|покажи|какие есть|что есть|каталог|ассортимент|товар|брел|кулон|чокер|браслет|подвеск|медуз|украшен|buy|order|checkout|show|product|keychain|pendant/u;

const EXPLICIT_PRODUCT_RE =
  /медуз|смайл|smile|crystal|кристалл|sage|брелок|брелк|кулон|чокер|браслет|подвеск|бусин|ключниц|украшени|кольц|серьг|цепочк|band|колье|товар/;

const CALL_SELLER_RE =
  /позвать продавца|позови продавца|позовите продавца|живой (человек|оператор)|свяж(и|ите) с (продавц|менеджер)|хочу с человеком|оператор|call (the )?seller|human please|speak to (a )?(human|seller)/i;

const FAQ_DELIVERY_RE = /доставк|сколько.*(стоит|будет).*достав|delivery|yetkazib|dostavka/i;
const FAQ_PICKUP_RE = /самовывоз|где.*(магазин|точка|забрать)|pickup|olib ketish|самовывоз/i;
const FAQ_PAY_RE = /оплат|как платить|способ(ы)? оплат|payme|click|наличн|карт(а|ой)|payment|to'?lov/i;
const FAQ_CUSTOM_RE = /на заказ|индивидуал|custom|по эскизу|по фото|референс/i;

function catNameOf(product, categories) {
  if (!product || !product.categoryId) return '';
  const c = (categories || []).find((x) => x.id === product.categoryId);
  return c ? txt(c.name) : '';
}

function tokenScore(tw, qw) {
  if (!tw || !qw) return 0;
  if (tw === qw) return 12;
  if (tw.length < 3 || qw.length < 3) return 0;
  if (tw.includes(qw) || qw.includes(tw)) return Math.min(10, Math.max(tw.length, qw.length));
  const pref = sharedPrefixLen(tw, qw);
  if (pref >= 4) return pref;
  if (tw.length >= 5 && qw.length >= 5 && tw.slice(0, 5) === qw.slice(0, 5)) return 5;
  return 0;
}

/* Возвращает отсортированные по силе совпадения {p, score}. */
function scoreProducts(q, products, categories) {
  const nq = normalizeText(q);
  const qWords = wordsOf(nq).filter((w) => w.length >= 3);
  if (!qWords.length) return [];

  const scored = (products || []).map((p) => {
    let score = 0;
    const titleWords = wordsOf(txt(p.title));
    const descWords = wordsOf(txt(p.desc));
    const tagWords = Array.isArray(p.tags) ? p.tags.flatMap((t) => wordsOf(t)) : [];

    for (const tw of titleWords) {
      let best = 0;
      for (const qw of qWords) best = Math.max(best, tokenScore(tw, qw));
      if (best) score += best;
    }
    for (const tw of descWords.concat(tagWords)) {
      let best = 0;
      for (const qw of qWords) best = Math.max(best, tokenScore(tw, qw));
      if (best) score += Math.round(best * 0.45);
    }
    // whole-title contains query fragments
    const titleNorm = normalizeText(txt(p.title));
    for (const qw of qWords) {
      if (qw.length >= 4 && titleNorm.includes(qw)) score += 6;
    }
    const cat = catNameOf(p, categories);
    if (cat) {
      for (const cw of wordsOf(cat)) {
        let best = 0;
        for (const qw of qWords) best = Math.max(best, tokenScore(cw, qw));
        if (best >= 4) score += Math.round(best * 0.7);
      }
    }
    return { p, score };
  });

  return scored
    .filter((x) => x.score >= 4)
    .sort((a, b) => b.score - a.score || (a.p.title && b.p.title ? txt(a.p.title).localeCompare(txt(b.p.title)) : 0))
    .slice(0, 3);
}

/* Возвращает до 3 товаров, отсортированных по силе совпадения с вопросом. */
function matchProducts(q, products, categories) {
  return scoreProducts(q, products, categories).map((x) => x.p);
}

function detectLang(text) {
  const q = String(text || '').toLowerCase();
  if (
    /\b(bor|yo'?q|qancha|narxi|savat|buyurtma|summa|rasmiylash)\b/.test(q) ||
    /[ʻʼ‘’]/u.test(q) ||
    /\b(o'|g')/i.test(q)
  ) {
    return 'uz';
  }
  if (/^(hi|hello|hey|how much|price|available|buy|order|cart|favorite)\b/i.test(q)) return 'en';
  return 'ru';
}

function fmtPrice(n, lang) {
  const v = Number(n || 0).toLocaleString('ru-RU').replace(/,/g, ' ');
  return lang === 'uz' ? `${v} so'm` : `${v} UZS`;
}

const SINGLE_TEMPLATES = {
  ru: [
    (p, l, stock) => `«${txt(p.title)}» — ${fmtPrice(p.price, l)}, ${stock}. Оформить заказ или добавить в корзину?`,
    (p, l, stock) => `Да, «${txt(p.title)}» ${stock} — ${fmtPrice(p.price, l)}. Хотите оформить? Могу сразу добавить в корзину.`,
    (p, l, stock) => `«${txt(p.title)}» стоит ${fmtPrice(p.price, l)}, ${stock}. Добавить в корзину или в избранное?`,
    (p, l, stock) => `«${txt(p.title)}» — ${fmtPrice(p.price, l)}. Сколько штук вам нужно?`,
  ],
  uz: [
    (p, l, stock) => `«${txt(p.title)}» — ${fmtPrice(p.price, l)}, ${stock}. Buyurtma berasizmi yoki savatga qo'shaymi?`,
    (p, l, stock) => `Ha, «${txt(p.title)}» ${stock} — ${fmtPrice(p.price, l)}. Rasmiylashtiramizmi? Savatga qo'shishim mumkin.`,
    (p, l, stock) => `«${txt(p.title)}» narxi ${fmtPrice(p.price, l)}, ${stock}. Savatga yoki istaklar ro'yxatiga qo'shaymi?`,
  ],
  en: [
    (p, l, stock) => `"${txt(p.title)}" — ${fmtPrice(p.price, l)}, ${stock}. Shall I add it to your cart or place the order?`,
    (p, l, stock) => `Yes, "${txt(p.title)}" is ${stock} — ${fmtPrice(p.price, l)}. Would you like to order it? I can add it to your cart.`,
    (p, l, stock) => `"${txt(p.title)}" costs ${fmtPrice(p.price, l)}, ${stock}. Add to cart or favorites?`,
  ],
};

const MULTI_INTRO = {
  ru: (n) => `Вот что у нас есть из этого в наличии (${n}):`,
  uz: (n) => `Mana shunday tovarlarimiz bor (${n}):`,
  en: (n) => `Here's what we have in stock (${n}):`,
};

const NO_SUCH = {
  ru: 'В нашем каталоге такой позиции нет, но есть другие украшения ручной работы — загляните в каталог или спросите: «что есть в наличии».',
  uz: "Bunday buyum katalogda yo'q, lekin qo'lda tayyorlangan boshqa zargarlik buyumlari bor — katalogga qarang yoki «nimalar bor?» deb so'rang.",
  en: 'We don\'t have that item in our catalog, but we do have other handmade pieces — check the catalog or ask "what\'s in stock?".',
};

function stockText(p, lang) {
  if (lang === 'uz') return p.inStock ? 'bor' : "yo'q";
  if (lang === 'en') return p.inStock ? 'in stock' : 'out of stock';
  return p.inStock ? 'в наличии' : 'нет в наличии';
}

function buildProductAnswer(q, products, categories) {
  const lang = detectLang(q);
  const scored = scoreProducts(q, products, categories);
  if (!scored.length) return null;
  const ranked = scored.map((x) => x.p);
  const primaryScore = scored[0].score;
  const secondScore = scored[1] ? scored[1].score : 0;
  const single =
    ranked.length === 1 ||
    primaryScore - secondScore >= 4 ||
    primaryScore >= secondScore * 2;

  const payload = {
    products: (single ? ranked.slice(0, 1) : ranked).map((p) => ({
      id: p.id,
      title: txt(p.title),
      price: p.price,
      inStock: !!p.inStock,
      image: Array.isArray(p.images) && p.images[0] ? p.images[0] : 'img/logo-ycs.png',
      categoryId: p.categoryId || null,
      category: catNameOf(p, categories) || null,
    })),
  };

  if (single) {
    const p = ranked[0];
    const tmpls = SINGLE_TEMPLATES[lang] || SINGLE_TEMPLATES.ru;
    const tmpl = tmpls[hashStr(String(q).toLowerCase() + '|' + p.id) % tmpls.length];
    return { answer: tmpl(p, lang, stockText(p, lang)), escalate: false, payload };
  }

  const lines = ranked
    .slice(0, 3)
    .map((p) => `• «${txt(p.title)}» — ${fmtPrice(p.price, lang)} — ${stockText(p, lang)}`)
    .join('\n');
  return {
    answer: `${(MULTI_INTRO[lang] || MULTI_INTRO.ru)(ranked.length)}\n${lines}`,
    escalate: false,
    payload,
  };
}

/* ------------------------------------------------------------------
   Knowledge base: ТОЛЬКО реальные данные сайта (антигаллюцинации)
   ------------------------------------------------------------------ */

async function buildKnowledgeBase({ orders = [], history = [] } = {}, preloaded = {}) {
  const [products, categories, rawSettings] = preloaded.products
    ? [
        preloaded.products,
        preloaded.categories || [],
        preloaded.settings || null,
      ]
    : await Promise.all([
        getProducts().catch(() => []),
        getCategories().catch(() => []),
        getSettings().catch(() => null),
      ]);
  const settings = mergePromoSettings(rawSettings || {});

  const lines = [];
  lines.push('=== ДАННЫЕ САЙТА YouCanSmile (Ташкент) ===');

  const about = txt(settings.about);
  if (about) lines.push(`О магазине: ${about}`);

  const contacts = settings.contacts || {};
  const contactBits = [];
  if (txt(settings.phone)) contactBits.push(`телефон ${txt(settings.phone)}`);
  if (txt(settings.instagram)) contactBits.push(`Instagram ${txt(settings.instagram)}`);
  if (txt(contacts.phone)) contactBits.push(`телефон ${txt(contacts.phone)}`);
  if (txt(contacts.instagram)) contactBits.push(`Instagram ${txt(contacts.instagram)}`);
  if (txt(contacts.telegram)) contactBits.push(`Telegram ${txt(contacts.telegram)}`);
  if (txt(contacts.whatsapp)) contactBits.push(`WhatsApp ${txt(contacts.whatsapp)}`);
  if (txt(contacts.email)) contactBits.push(`email ${txt(contacts.email)}`);
  if (contactBits.length) lines.push(`Контакты: ${contactBits.join(', ')}.`);

  const pickup = (settings.pickupPoints || [])
    .map((p) => `• ${txt(p.name)} — ${txt(p.address)}`)
    .filter(Boolean);
  if (pickup.length) {
    lines.push(`Точки самовывоза:\n${pickup.join('\n')}`);
  } else {
    lines.push('Точек самовывоза в данных нет.');
  }

  const card =
    settings.cardNumber ||
    settings.cardRequisites?.card ||
    settings.cardRequisites?.number ||
    '';
  const cardName = settings.cardRecipient || settings.cardRequisites?.name || '';
  if (card) {
    lines.push(`Реквизиты карты для оплаты: ${card}${cardName ? `, получатель ${cardName}` : ''}.`);
  } else if (txt(settings.cardRequisites)) {
    lines.push(`Реквизиты: ${txt(settings.cardRequisites)}`);
  } else {
    lines.push('Реквизитов карты в данных нет.');
  }

  const promos = (settings.promos || [])
    .filter((p) => p && (p.title || p.text))
    .slice(0, 5)
    .map((p) => `• ${txt(p.badge) ? txt(p.badge) + ': ' : ''}${txt(p.title)} — ${txt(p.text)}`)
    .filter(Boolean);
  if (promos.length) lines.push(`Акции:\n${promos.join('\n')}`);

  const catNames = categories.map((c) => txt(c.name)).filter(Boolean);
  if (catNames.length) lines.push(`Категории: ${catNames.join(', ')}.`);

  const catById = new Map(categories.map((c) => [c.id, txt(c.name) || c.id]));
  const productLines = products
    .slice(0, MAX_KB_PRODUCTS)
    .map((p) => {
      const stock = p.inStock ? 'в наличии' : 'нет в наличии';
      const cat = catById.get(p.categoryId);
      return `• ${txt(p.title)} — ${p.price} UZS — ${stock}${cat ? ` — категория ${cat}` : ''}`;
    })
    .filter(Boolean);
  if (productLines.length) {
    lines.push(`Каталог (только эти позиции реально есть):\n${productLines.join('\n')}`);
  } else {
    lines.push('Каталог пуст.');
  }

  const orderLines = orders.slice(0, 5).map((o) => {
    const parts = [
      orderNumberLabel(o, 'ru'),
      `статус «${STATUS_LABELS[o.status] || o.status}»`,
      `сумма ${o.total} UZS`,
    ];
    if (o.fulfillment) parts.push(o.fulfillment === 'delivery' ? 'доставка' : 'самовывоз');
    if (o.payment) parts.push(o.payment === 'cash' ? 'оплата наличными' : 'оплата картой');
    const items = (o.items || []).map((i) => `${i.title} × ${i.qty}`).join(', ');
    if (items) parts.push(`товары: ${items}`);
    return `• ${parts.join(', ')}`;
  });
  if (orderLines.length) {
    lines.push(`Заказы клиента:\n${orderLines.join('\n')}`);
  } else {
    lines.push('Заказов у клиента нет.');
  }

  const historyLines = history
    .slice(-MAX_KB_HISTORY)
    .map((m) => {
      const who =
        m.author === 'customer' ? 'клиент' : m.author === 'agent' ? 'бот' : m.author === 'seller' ? 'продавец' : m.author;
      return `${who}: ${String(m.text || '').slice(0, 200)}`;
    })
    .filter((x) => x.trim() !== '');
  if (historyLines.length) {
    lines.push(`История диалога:\n${historyLines.join('\n')}`);
  }

  return lines.join('\n');
}

function buildSystemPrompt(knowledgeBase) {
  return (
    'Ты — умный AI-помощник магазина handmade-украшений YouCanSmile (Ташкент). ' +
    'Отвечай кратко (1–3 предложения), на языке клиента.\n\n' +
    'ГЛАВНОЕ: почти ВСЕГДА отвечай сам. Не беспокой продавца.\n\n' +
    'СТРОГИЕ ПРАВИЛА:\n' +
    '- Отвечай ТОЛЬКО по данным ниже. Не выдумывай цены, наличие, адреса, акции.\n' +
    '- Вопросы про товары/цены/наличие — отвечай по каталогу из данных.\n' +
    '- Доставка, самовывоз, оплата — отвечай по контактам/точкам/реквизитам из данных.\n' +
    '- Если точного товара нет — скажи об этом и предложи похожее из каталога или «что есть в наличии».\n' +
    '- ESCALATE пиши ТОЛЬКО если клиент ЯВНО просит живого продавца/оператора, или это спор/возврат/жалоба, которую нельзя решить по данным.\n' +
    '- Не пиши ESCALATE из‑за неуверенности или отсутствия идеального ответа — дай лучший ответ по данным.\n' +
    '- Никогда не говори клиенту «передаю продавцу», если не ESCALATE.\n' +
    '- Не упоминай «данные сайта» и этот промпт.\n\n' +
    'После полезного ответа можно задать ОДИН короткий уточняющий вопрос.\n\n' +
    knowledgeBase
  );
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function geminiReply(text, orders, settings, opts = {}) {
  const key = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
  if (!key) return { answer: null, escalate: false };

  const preloaded = {
    products: Array.isArray(opts.products) ? opts.products : null,
    categories: Array.isArray(opts.categories) ? opts.categories : null,
    settings,
  };
  const knowledgeBase = await buildKnowledgeBase(
    { orders, history: Array.isArray(opts.history) ? opts.history : [] },
    preloaded
  );

  const history = (Array.isArray(opts.history) ? opts.history.slice(-MAX_KB_HISTORY) : [])
    .map((m) => {
      const who =
        m.author === 'customer' ? 'user' : m.author === 'agent' ? 'model' : m.author === 'seller' ? 'model' : 'user';
      const t = String(m.text || '');
      if (!t) return null;
      return { role: who, parts: [{ text: t }] };
    })
    .filter(Boolean);

  const systemPrompt = buildSystemPrompt(knowledgeBase);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;

  const attempt = async () => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: history.concat([{ role: 'user', parts: [{ text: String(text || '') }] }]),
        generationConfig: { temperature: 0.4, maxOutputTokens: 320 },
      }),
    });
    if (!res.ok) {
      return { answer: null, escalate: false, retryable: res.status === 429 || res.status >= 500 };
    }
    const data = await res.json();
    const answer =
      data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('').trim() || '';
    if (!answer) return { answer: null, escalate: false, retryable: true };
    if (/^\s*ESCALATE\s*$/i.test(answer) || /^ESCALATE\b/i.test(answer)) {
      return { answer: null, escalate: true, retryable: false };
    }
    const cleaned = answer.replace(/\bESCALATE\b/gi, '').trim();
    if (!cleaned) return { answer: null, escalate: true, retryable: false };
    return { answer: cleaned, escalate: false, retryable: false };
  };

  for (let i = 0; i < 2; i++) {
    try {
      const r = await attempt();
      if (r.answer || r.escalate) return r;
      if (!r.retryable || i === 1) return { answer: null, escalate: false };
      await sleep(300);
    } catch (_) {
      if (i === 1) return { answer: null, escalate: false };
      await sleep(300);
    }
  }
  return { answer: null, escalate: false };
}

function faqReply(text, settings) {
  const q = String(text || '');
  const lang = detectLang(q);
  const s = settings || {};
  const pickup = (s.pickupPoints || [])
    .map((p) => `• ${txt(p.name)} — ${txt(p.address)}`)
    .filter(Boolean);

  if (FAQ_DELIVERY_RE.test(q)) {
    const ans =
      lang === 'uz'
        ? "Yetkazib berish Toshkent bo'ylab. Aniq narxni buyurtmada ko'rsatamiz yoki chatda yozing — yordam beraman. Olib ketish ham bor."
        : lang === 'en'
          ? 'We deliver across Tashkent. Exact fee is confirmed at checkout — or ask here. Pickup is also available.'
          : 'Доставка по Ташкенту. Точную стоимость подтвердим при оформлении — или спросите здесь. Есть и самовывоз.';
    return { answer: ans, escalate: false };
  }
  if (FAQ_PICKUP_RE.test(q)) {
    if (pickup.length) {
      const head =
        lang === 'uz' ? "Olib ketish nuqtalari:\n" : lang === 'en' ? 'Pickup points:\n' : 'Точки самовывоза:\n';
      return { answer: head + pickup.join('\n'), escalate: false };
    }
    const ans =
      lang === 'uz'
        ? "Olib ketish bor — nuqtalarni katalogdagi buyurtmada ko'rasiz."
        : lang === 'en'
          ? 'Pickup is available — points are shown at checkout.'
          : 'Самовывоз есть — точки видны при оформлении заказа.';
    return { answer: ans, escalate: false };
  }
  if (FAQ_PAY_RE.test(q)) {
    const card = s.cardNumber || '';
    const name = s.cardRecipient || '';
    const base =
      lang === 'uz'
        ? "To'lov: karta o'tkazmasi yoki naqd (faqat olib ketishda). Yetkazib berishda — faqat karta."
        : lang === 'en'
          ? 'Payment: card transfer or cash (pickup only). Delivery — card only.'
          : 'Оплата: перевод на карту или наличные при самовывозе. При доставке — только карта.';
    const extra = card ? `\n${name ? name + ': ' : ''}${card}` : '';
    return { answer: base + extra, escalate: false };
  }
  if (FAQ_CUSTOM_RE.test(q)) {
    const ans =
      lang === 'uz'
        ? "Ha, individual buyurtma qilamiz — g'oya/fotosini yozing, yordam beraman."
        : lang === 'en'
          ? 'Yes, we make custom pieces — send an idea or photo and I’ll help.'
          : 'Да, делаем на заказ — опишите идею или пришлите фото, помогу оформить.';
    return { answer: ans, escalate: false };
  }
  return null;
}

function autoFallback(text, products, categories) {
  const lang = detectLang(text);
  const match = buildProductAnswer(text, products, categories);
  if (match) return match;
  if (EXPLICIT_PRODUCT_RE.test(String(text || '')) || PRODUCT_INTENT_RE.test(String(text || ''))) {
    return { answer: NO_SUCH[lang] || NO_SUCH.ru, escalate: false };
  }
  const ans =
    lang === 'uz'
      ? "Savolingizni tushunmadim. Mahsulot nomi, narx, yetkazib berish yoki to'lov haqida so'rang — yordam beraman. Sotuvchini chaqirish uchun yozing: «позвать продавца»."
      : lang === 'en'
        ? 'I can help with products, prices, delivery and payment. To talk to a human, type “call seller”.'
        : 'Могу помочь с товарами, ценами, доставкой и оплатой. Если нужен живой продавец — напишите «позвать продавца».';
  return { answer: ans, escalate: false };
}

async function aiReply(text, orders, settings, opts = {}) {
  const raw = String(text || '');

  if (CALL_SELLER_RE.test(raw)) {
    return { answer: null, escalate: true };
  }

  const status = ruleBasedReply(raw, orders, settings);
  if (status.answer) return status;

  const products = Array.isArray(opts.products) ? opts.products : await getProducts().catch(() => []);
  const categories = Array.isArray(opts.categories) ? opts.categories : await getCategories().catch(() => []);

  const faq = faqReply(raw, settings);
  if (faq) return faq;

  // Always try catalog match before Gemini / escalate
  const productHit = buildProductAnswer(raw, products, categories);
  if (productHit) return productHit;

  if (PRODUCT_INTENT_RE.test(raw) || EXPLICIT_PRODUCT_RE.test(raw)) {
    const lang = detectLang(raw);
    return { answer: NO_SUCH[lang] || NO_SUCH.ru, escalate: false };
  }

  if (!process.env.GEMINI_API_KEY) {
    return autoFallback(raw, products, categories);
  }

  const gem = await geminiReply(raw, orders, settings, { ...opts, products, categories });
  if (gem.answer) return { answer: gem.answer, escalate: false };
  if (gem.escalate) {
    // Gemini wanted human — still avoid bothering seller unless explicit
    if (CALL_SELLER_RE.test(raw) || /жалоб|возврат|обман|претенз|refund|complaint/i.test(raw)) {
      return { answer: null, escalate: true };
    }
    return autoFallback(raw, products, categories);
  }
  return autoFallback(raw, products, categories);
}

module.exports = {
  aiReply,
  ruleBasedReply,
  buildKnowledgeBase,
  geminiReply,
  matchProducts,
  detectLang,
};
