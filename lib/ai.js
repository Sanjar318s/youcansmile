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

/* Fast path: true if edit distance <= 1 (for typos like мидуз↔медуз). */
function editDistAtMost1(a, b) {
  if (a === b) return true;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  if (la > lb) return editDistAtMost1(b, a);
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (la === lb) {
      i++;
      j++;
    } else {
      j++; // insertion in b
    }
  }
  if (j < lb || i < la) edits++;
  return edits <= 1;
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
  /позвать продавца|позови продавца|позовите продавца|живой (человек|оператор)|связ(ать|аться|и|ите|ывайтесь)?\s*с\s*(прод[ао]вц|менеджер)|как\s+(можно\s+)?связ\w*\s+с\s*(прод[ао]вц|менеджер)|хочу\s+(к\s+)?прод[ао]вц|хочу с человеком|оператор|call (the )?seller|human please|speak to (a )?(human|seller)|contact (the )?seller/i;

const STOCK_BROWSE_RE =
  /что\s+(есть\s+)?в\s+наличи|какие\s+(товары\s+|украшения\s+)?есть|что\s+у\s+вас\s+есть|что\s+есть\??\s*$|весь\s+ассортимент|nimalar\s+bor|what'?s\s+in\s+stock|show\s+(me\s+)?(the\s+)?(catalog|stock)/i;

const CART_EXPLICIT_RE =
  /в\s*к[ао]рзин[уае]?|добав(ь|ить|ляйте|ьте)?(\s+\w+){0,3}\s+в\s*к[ао]рзин|add(\s+it)?\s+to\s+(the\s+)?cart|savatga(\s+qo'?sh)?/i;
const CART_AFFIRM_RE = /^(да|давай|ок|окей|хорошо|ладно|угу|yes|ok|добавь|добавляй)\.?$/i;

const FAQ_DELIVERY_RE =
  /доставк|скольк\w*\s+(сто\w*|будет)\s+.*достав|достав\w*\s+скольк|скольк\w*\s+достав|стоимость\s+достав|цена\s+достав|delivery(\s+fee|\s+cost|\s+price)?|yetkazib|dostavka/i;
const FAQ_PICKUP_RE = /самовывоз|где.*(магазин|точка|забрать)|pickup|olib ketish|самовывоз/i;
const FAQ_PAY_RE = /оплат|как платить|способ(ы)? оплат|payme|click|наличн|карт(а|ой)|payment|to'?lov/i;
const FAQ_CUSTOM_RE = /на заказ|индивидуал|custom|по эскизу|по фото|референс/i;
const FAQ_LEADTIME_RE =
  /изготовл|сколько\s+ждать|как\s+долго\s+(делать|ждут|ждать)|срок\s+(изготов|заказ|работ)|production(\s+time)?|tayyorlash|qancha\s+vaqt/i;

const SEARCH_STOPWORDS = new Set(
  [
    'сколько',
    'скольк',
    'стоит',
    'стоим',
    'цена',
    'цену',
    'ждать',
    'ждите',
    'изготовлен',
    'изготовлени',
    'изготовление',
    'время',
    'срок',
    'сроки',
    'можно',
    'нужно',
    'хочу',
    'покажи',
    'подскажи',
    'расскажи',
    'какой',
    'какая',
    'какие',
    'есть',
    'наличие',
    'наличи',
    'товар',
    'товары',
    'доставка',
    'доставк',
    'оплата',
    'заказ',
    'заказа',
    'please',
    'how',
    'much',
    'long',
    'what',
    'when',
    'where',
    'cost',
    'price',
  ].map((w) => softStem(w))
);

const QTY_WORDS = {
  один: 1,
  одна: 1,
  одно: 1,
  два: 2,
  две: 2,
  три: 3,
  четыре: 4,
  пять: 5,
  шесть: 6,
  семь: 7,
  восемь: 8,
  девять: 9,
  десять: 10,
  bir: 1,
  ikki: 2,
  uch: 3,
  tort: 4,
  besh: 5,
};

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
  // typo tolerance: мидуз ↔ медуз
  if (tw.length >= 5 && qw.length >= 5 && editDistAtMost1(tw, qw)) return 8;
  return 0;
}

/* Возвращает отсортированные по силе совпадения {p, score}. */
function scoreProducts(q, products, categories) {
  const nq = normalizeText(q);
  const qWords = wordsOf(nq).filter((w) => w.length >= 3 && !SEARCH_STOPWORDS.has(w));
  if (!qWords.length) return [];

  const scored = (products || []).map((p) => {
    let score = 0;
    let titleScore = 0;
    const titleWords = wordsOf(txt(p.title));
    const descWords = wordsOf(txt(p.desc));
    const tagWords = Array.isArray(p.tags) ? p.tags.flatMap((t) => wordsOf(t)) : [];

    for (const tw of titleWords) {
      let best = 0;
      for (const qw of qWords) best = Math.max(best, tokenScore(tw, qw));
      if (best) {
        score += best;
        titleScore += best;
      }
    }
    for (const tw of descWords.concat(tagWords)) {
      let best = 0;
      for (const qw of qWords) best = Math.max(best, tokenScore(tw, qw));
      // desc-only matches must be weaker so FAQ words in descriptions don't win
      if (best) score += Math.round(best * 0.25);
    }
    // whole-title contains query fragments
    const titleNorm = normalizeText(txt(p.title));
    for (const qw of qWords) {
      if (qw.length >= 4 && titleNorm.includes(qw)) {
        score += 6;
        titleScore += 6;
      } else if (qw.length >= 5) {
        // typo vs title stem: мидуз ↔ медузки
        for (const tw of titleWords) {
          if (editDistAtMost1(tw, qw)) {
            score += 8;
            titleScore += 8;
            break;
          }
          if (tw.length > qw.length && editDistAtMost1(tw.slice(0, qw.length), qw)) {
            score += 8;
            titleScore += 8;
            break;
          }
          if (qw.length > tw.length && editDistAtMost1(qw.slice(0, tw.length), tw)) {
            score += 7;
            titleScore += 7;
            break;
          }
        }
      }
    }
    const cat = catNameOf(p, categories);
    if (cat) {
      for (const cw of wordsOf(cat)) {
        let best = 0;
        for (const qw of qWords) best = Math.max(best, tokenScore(cw, qw));
        if (best >= 4) score += Math.round(best * 0.7);
      }
    }
    // Require some title signal — pure description hits are ignored
    if (titleScore < 4) return { p, score: 0 };
    return { p, score };
  });

  return scored
    .filter((x) => x.score >= 6)
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

function toCardProduct(p, categories) {
  return {
    id: p.id,
    title: txt(p.title) || p.title || '',
    price: p.price,
    inStock: p.inStock !== false,
    image:
      (Array.isArray(p.images) && p.images[0] ? p.images[0] : null) ||
      p.image ||
      'img/logo-ycs.png',
    categoryId: p.categoryId || null,
    category: catNameOf(p, categories) || p.category || null,
  };
}

function lastProductFromHistory(history) {
  const list = Array.isArray(history) ? history : [];
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i];
    if (!m || (m.author !== 'agent' && m.type !== 'product')) continue;
    let payload = m.payload;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch (_) {
        payload = null;
      }
    }
    if (!payload) continue;
    const products = Array.isArray(payload.products)
      ? payload.products
      : payload.id
        ? [payload]
        : [];
    if (products[0] && products[0].id) {
      return { product: products[0], suggestedQty: Number(payload.suggestedQty) || null };
    }
  }
  return null;
}

function parseQty(text) {
  const q = String(text || '').toLowerCase();
  const m = q.match(/(\d+)\s*(шт|штук|штуки|штуку|dona)?/i);
  if (m) {
    const n = Number(m[1]);
    if (n >= 1 && n <= 99) return n;
  }
  for (const [w, n] of Object.entries(QTY_WORDS)) {
    if (new RegExp(`(?:^|\\s)${w}(?:\\s|$)`, 'i').test(q) && /(шт|штук|нужн|хочу|возьм|бер|заказ|dona)/i.test(q)) {
      return n;
    }
  }
  for (const [w, n] of Object.entries(QTY_WORDS)) {
    if (new RegExp(`${w}\\s*шт`, 'i').test(q)) return n;
  }
  return null;
}

function isQtyFollowUp(text) {
  const q = String(text || '');
  if (parseQty(q) == null) return false;
  if (/^\s*\d+\s*(шт|штук|штуки|штуку|dona)?\.?\s*$/i.test(q)) return true;
  return /нужн|хочу|возьм|бер|заказ|штук|шт\b|quantity|dona|оформи/i.test(q);
}

function qtyFollowUpReply(text, history, products, categories) {
  if (!isQtyFollowUp(text)) return null;
  const qty = parseQty(text);
  if (!qty) return null;
  const last = lastProductFromHistory(history);
  if (!last) return null;

  const fresh = (products || []).find((p) => p.id === last.product.id);
  const card = toCardProduct(fresh || last.product, categories);
  const lang = detectLang(text);
  const total = fmtPrice(Number(card.price || 0) * qty, lang);
  const title = card.title;
  const answer =
    lang === 'uz'
      ? `Ajoyib, ${qty}× «${title}» — ${total}. Savatga qo‘shaymi yoki hozir rasmiylashtiramiz?`
      : lang === 'en'
        ? `Great — ${qty}× "${title}" = ${total}. Add to cart or order now?`
        : `Отлично, ${qty}× «${title}» — ${total}. Добавить в корзину или оформить сейчас?`;

  return {
    answer,
    escalate: false,
    payload: { products: [card], suggestedQty: qty },
  };
}

function lastAgentMessage(history) {
  const list = Array.isArray(history) ? history : [];
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i] && list[i].author === 'agent') return list[i];
  }
  return null;
}

function agentOfferedCart(history) {
  const m = lastAgentMessage(history);
  if (!m) return false;
  const t = String(m.text || '');
  if (/к[ао]рзин|добав|savat|add to cart|оформить заказ или|хотите добавить/i.test(t)) return true;
  let payload = m.payload;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch (_) {
      payload = null;
    }
  }
  if (payload && (payload.action === 'add_to_cart' || payload.suggestedQty)) return true;
  const products = payload && Array.isArray(payload.products) ? payload.products : [];
  // bare product card that asked about cart in templates
  return products.length === 1 && /корзин|оформить|добав/i.test(t);
}

function cartFollowUpReply(text, history, products, categories) {
  const raw = String(text || '').trim();
  if (!raw) return null;

  const explicit = CART_EXPLICIT_RE.test(raw);
  const affirm = CART_AFFIRM_RE.test(raw);
  if (!explicit && !affirm) return null;
  if (affirm && !agentOfferedCart(history)) return null;

  const last = lastProductFromHistory(history);
  if (!last) {
    if (!explicit) return null;
    const lang = detectLang(raw);
    const ans =
      lang === 'uz'
        ? "Qaysi mahsulotni savatga qo‘shaylik? Nomini yozing yoki kartadagi «Savatga» tugmasini bosing."
        : lang === 'en'
          ? 'Which product should I add? Name it or tap “Add to cart” on a card.'
          : 'Какой товар добавить? Напишите название или нажмите «В корзину» на карточке.';
    return { answer: ans, escalate: false };
  }

  const fresh = (products || []).find((p) => p.id === last.product.id);
  const card = toCardProduct(fresh || last.product, categories);
  const qty = Math.max(1, Number(last.suggestedQty) || parseQty(raw) || 1);
  const lang = detectLang(raw);
  const price = fmtPrice(card.price, lang);
  const answer =
    lang === 'uz'
      ? `«${card.title}» (${price}) savatga qo‘shildi ×${qty}. Rasmiylashtiramizmi yoki yana nima kerak?`
        : lang === 'en'
          ? `"${card.title}" (${price}) ×${qty} added to your cart. Checkout now or browse more?`
          : `«${card.title}» (${price}) ×${qty} добавлен(ы) в корзину. Откройте корзину или оформите заказ.`;

  return {
    answer,
    escalate: false,
    payload: {
      action: 'add_to_cart',
      products: [card],
      suggestedQty: qty,
    },
  };
}

function stockBrowseReply(text, products, categories) {
  if (!STOCK_BROWSE_RE.test(String(text || ''))) return null;
  const lang = detectLang(text);
  const inStock = (products || []).filter((p) => p && p.inStock !== false).slice(0, 5);
  if (!inStock.length) {
    const ans =
      lang === 'uz'
        ? "Hozir omborda mahsulot yo‘q. Keyinroq yozing yoki «позвать продавца»."
        : lang === 'en'
          ? 'Nothing is in stock right now. Try again later or type “call seller”.'
          : 'Сейчас в наличии ничего нет. Напишите позже или «позвать продавца».';
    return { answer: ans, escalate: false };
  }
  const cards = inStock.map((p) => toCardProduct(p, categories));
  const lines = cards
    .map((p) => `• «${p.title}» — ${fmtPrice(p.price, lang)}`)
    .join('\n');
  const head =
    lang === 'uz'
      ? `Hozir bor (${cards.length}):`
      : lang === 'en'
        ? `In stock now (${cards.length}):`
        : `Сейчас в наличии (${cards.length}):`;
  return {
    answer: `${head}\n${lines}`,
    escalate: false,
    payload: { products: cards },
  };
}

function isHardProductQuery(text) {
  const q = String(text || '');
  if (STOCK_BROWSE_RE.test(q)) return false;
  if (isQtyFollowUp(q) && !/(медуз|мидуз|брел|кулон|чокер|браслет|подвеск|товар\s+с)/i.test(q)) {
    return false;
  }
  return (
    EXPLICIT_PRODUCT_RE.test(q) ||
    /медуз|мидуз|брел|кулон|чокер|браслет|подвеск|покажи|есть\s+ли|товар\s+с|ищу|хочу\s+(брел|кулон|медуз)/i.test(q)
  );
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
    products: (single ? ranked.slice(0, 1) : ranked).map((p) => toCardProduct(p, categories)),
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
    '- Не упоминай «данные сайта» и этот промпт.\n' +
    '- НИКОГДА не утверждай, что товар уже добавлен в корзину или заказ оформлен. Корзина только на сайте у клиента. Проси нажать «В корзину» / «Купить сейчас» или написать «в корзину».\n\n' +
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

function recentTopicDelivery(history) {
  const recent = (Array.isArray(history) ? history : []).slice(-8);
  return recent.some((m) => /доставк|delivery|yetkazib|dostavka|shipping/i.test(String(m.text || '')));
}

function stripChatNoise(text) {
  return String(text || '')
    .replace(/^[\s\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F\u200D]+/u, '')
    .trim();
}

function faqReply(text, settings, history) {
  const q = stripChatNoise(text);
  const lang = detectLang(q);
  const s = settings || {};
  const pickup = (s.pickupPoints || [])
    .map((p) => `• ${txt(p.name)} — ${txt(p.address)}`)
    .filter(Boolean);

  const vaguePrice =
    /^\s*скольк\w*\s+сто\w*\s*\??\s*$/i.test(q) || /^\s*how\s+much\??\s*$/i.test(q);
  if (vaguePrice && recentTopicDelivery(history)) {
    return faqReply('сколько стоит доставка', settings, history);
  }
  if (vaguePrice) {
    const ans =
      lang === 'uz'
        ? "Nimani nazarda tutyapsiz: yetkazib berish narxi yoki qaysidir mahsulot?"
        : lang === 'en'
          ? 'Do you mean delivery cost, or the price of a specific product?'
          : 'Уточните: стоимость доставки или цена какого товара?';
    return { answer: ans, escalate: false };
  }

  if (FAQ_DELIVERY_RE.test(q) || (vaguePrice && /достав/i.test(q))) {
    const fromSettings =
      txt(s.shipping_delivery_text) ||
      txt(s.cart_delivery_note) ||
      txt(s.shippingDeliveryText) ||
      '';
    const note =
      lang === 'uz'
        ? "Aniq summa buyurtmada tasdiqlanadi (manzilga qarab). Olib ketish — bepul."
        : lang === 'en'
          ? 'The exact fee is confirmed at checkout (depends on address). Pickup is free.'
          : 'Точная сумма зависит от адреса и подтверждается при оформлении. Самовывоз — бесплатно.';
    const ans = fromSettings
      ? `${fromSettings}${/самовывоз|pickup|olib ketish|беспал/i.test(fromSettings) ? '' : ' ' + note}`
      : lang === 'uz'
        ? `Yetkazib berish Toshkent bo'ylab. ${note}`
        : lang === 'en'
          ? `We deliver across Tashkent. ${note}`
          : `Доставка по Ташкенту. ${note}`;
    return { answer: ans.trim(), escalate: false };
  }
  if (FAQ_LEADTIME_RE.test(q)) {
    const fromSettings = txt(s.production_time) || txt(s.lead_time) || txt(s.shipping_lead_text) || '';
    const ans =
      fromSettings ||
      (lang === 'uz'
        ? "Odatda handmade 1–3 kun. Murakkab buyurtma — uzoqroq. Aniq muddatni buyurtmada aytamiz."
        : lang === 'en'
          ? 'Handmade pieces usually take 1–3 days. Complex orders take longer — we confirm the exact time at checkout.'
          : 'Обычно handmade 1–3 дня. Сложные заказы — дольше. Точный срок скажем при оформлении.');
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

function autoFallback(text, products, categories, history) {
  const lang = detectLang(text);
  const cart = cartFollowUpReply(text, history, products, categories);
  if (cart) return cart;
  const qty = qtyFollowUpReply(text, history, products, categories);
  if (qty) return qty;
  const stock = stockBrowseReply(text, products, categories);
  if (stock) return stock;
  const match = buildProductAnswer(text, products, categories);
  if (match) return match;
  if (isHardProductQuery(text)) {
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
  const history = Array.isArray(opts.history) ? opts.history : [];

  if (CALL_SELLER_RE.test(raw)) {
    return { answer: null, escalate: true };
  }

  const status = ruleBasedReply(raw, orders, settings);
  if (status.answer) return status;

  const products = Array.isArray(opts.products) ? opts.products : await getProducts().catch(() => []);
  const categories = Array.isArray(opts.categories) ? opts.categories : await getCategories().catch(() => []);

  const faq = faqReply(raw, settings, history);
  if (faq) return faq;

  // FAQ-ish questions must never fall through to random product cards
  if (FAQ_LEADTIME_RE.test(stripChatNoise(raw)) || FAQ_DELIVERY_RE.test(stripChatNoise(raw))) {
    const again = faqReply(raw, settings, history);
    if (again) return again;
  }

  const cartHit = cartFollowUpReply(raw, history, products, categories);
  if (cartHit) return cartHit;

  const qtyHit = qtyFollowUpReply(raw, history, products, categories);
  if (qtyHit) return qtyHit;

  const stockHit = stockBrowseReply(raw, products, categories);
  if (stockHit) return stockHit;

  // Always try catalog match before Gemini / escalate
  const productHit = buildProductAnswer(raw, products, categories);
  if (productHit) return productHit;

  if (isHardProductQuery(raw)) {
    const lang = detectLang(raw);
    return { answer: NO_SUCH[lang] || NO_SUCH.ru, escalate: false };
  }

  if (!process.env.GEMINI_API_KEY) {
    return autoFallback(raw, products, categories, history);
  }

  const gem = await geminiReply(raw, orders, settings, { ...opts, products, categories, history });
  if (gem.answer) return { answer: gem.answer, escalate: false };
  if (gem.escalate) {
    if (CALL_SELLER_RE.test(raw) || /жалоб|возврат|обман|претенз|refund|complaint/i.test(raw)) {
      return { answer: null, escalate: true };
    }
    return autoFallback(raw, products, categories, history);
  }
  return autoFallback(raw, products, categories, history);
}

module.exports = {
  aiReply,
  ruleBasedReply,
  buildKnowledgeBase,
  geminiReply,
  matchProducts,
  detectLang,
};
