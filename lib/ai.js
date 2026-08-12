const { orderNumberLabel } = require('./orders');

const STATUS_LABELS = {
  new: 'Новый',
  processing: 'Обрабатывается',
  contacting: 'Скоро свяжется',
  in_progress: 'В процессе',
  done: 'Завершён',
  cancelled: 'Отменён',
};

function txt(obj, lang = 'ru') {
  if (!obj) return '';
  if (typeof obj === 'string') return obj;
  return obj[lang] || obj.ru || obj.en || obj.uz || Object.values(obj)[0] || '';
}

function faqReply(text, settings) {
  const q = String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!q) return null;

  const pickup = (settings?.pickupPoints || [])
    .map((p) => `• ${txt(p.name)} — ${txt(p.address)}`)
    .filter(Boolean)
    .join('\n');

  const card =
    settings?.cardNumber ||
    settings?.cardRequisites?.card ||
    settings?.cardRequisites?.number ||
    '';
  const cardName = settings?.cardRecipient || settings?.cardRequisites?.name || '';

  // delivery cost / how delivery works
  if (/доставк|delivery|yetkaz|сколько.*(стоит|цена).*достав|достав.*(стоит|цена|скольк)/.test(q)) {
    return (
      'Доставка по Ташкенту — уточняем стоимость при оформлении (зависит от адреса). ' +
      'Также доступен самовывоз. Могу позвать продавца, если нужны детали по вашему адресу.'
    );
  }

  // pickup
  if (/самовывоз|pickup|olib ket/.test(q)) {
    if (pickup) {
      return `Да, самовывоз в Ташкенте есть:\n${pickup}\n\nВыберите точку при оформлении заказа.`;
    }
    return 'Да, самовывоз в Ташкенте есть. Точку можно выбрать при оформлении заказа — или позовите продавца.';
  }
  if (/где.*(забрать|магазин|находитесь)|адрес.*магазин|точка.*выдач/.test(q)) {
    if (pickup) return `Наши точки:\n${pickup}`;
    return 'Адрес самовывоза подскажет продавец или появится при оформлении заказа.';
  }

  // custom order
  if (/на заказ|индивидуаль|кастом|custom|buyurtma asosida|сделать.*заказ|сделаете|yasay/.test(q)) {
    return (
      'Да! Можно сделать индивидуально — брелок, кулон и другие украшения по вашей идее или фото. ' +
      'Оформите «Индивидуальный заказ» на сайте или опишите идею здесь — продавец поможет.'
    );
  }

  // payment
  if (/как.*(оплат|платить)|оплат|payment|to['ʻ’]?lov|карт|налич|перевод|реквизит/.test(q)) {
    let ans =
      'Оплата: перевод на карту по реквизитам или наличными при получении/самовывозе (как удобнее).';
    if (card) {
      ans += `\n\nКарта для перевода: ${card}${cardName ? ` (${cardName})` : ''}.`;
      ans += '\nПосле оплаты пришлите фото чека в заказе.';
    } else {
      ans += '\nРеквизиты продавец пришлёт при оформлении заказа.';
    }
    return ans;
  }

  // production time
  if (/сколько.*(ждать|дела|изготов|готов)|срок|изготовлен|production|qancha.*(vaqt|kut)|ждать.*изготов/.test(q)) {
    return (
      'Обычно готовые позиции — быстрее, индивидуальные — от нескольких дней (зависит от сложности). ' +
      'Точный срок скажет продавец по вашей идее.'
    );
  }

  // greeting
  if (/^(привет|здравствуй|здравств|hello|hi|salom|hey)[\s!.]*$/i.test(q)) {
    return 'Здравствуйте! Я помощник YouCanSmile 🌿 Могу подсказать про доставку, самовывоз, оплату и заказ. Если нужен живой ответ — напишите «позвать продавца».';
  }

  // catalog / what do you sell
  if (/что.*(прода|есть)|ассортимент|каталог|украшен|брелк|кулон/.test(q)) {
    return 'У нас handmade: брелки, кулоны, чокеры, браслеты и подвески. Смотрите каталог на сайте — или опишите, что ищете.';
  }

  // explicit ask for seller
  if (/продавц|оператор|человек|менеджер|позвать|связ.*продав|call.*seller|seller/.test(q)) {
    return null; // escalate
  }

  return null;
}

function ruleBasedReply(text, orders, settings) {
  const faq = faqReply(text, settings);
  if (faq) return { answer: faq, escalate: false };

  const q = String(text || '').toLowerCase();
  const latest = orders[0];
  if (!latest) {
    if (/статус|заказ|order|status|buyurtma/.test(q)) {
      return {
        answer: 'У вас пока нет заказов на сайте. Оформите заказ в каталоге или напишите «позвать продавца».',
        escalate: false,
      };
    }
    return { answer: null, escalate: true };
  }
  const st = STATUS_LABELS[latest.status] || latest.status;
  if (/статус|где.*заказ|order status|buyurtma/.test(q)) {
    return { answer: `Ваш последний заказ — ${orderNumberLabel(latest, 'ru')} — статус: «${st}».`, escalate: false };
  }
  if (/доставк|delivery|yetkaz/.test(q) && /заказ|мо[йе]|order/.test(q)) {
    const f = latest.fulfillment === 'delivery' ? 'доставка' : 'самовывоз';
    return { answer: `${orderNumberLabel(latest, 'ru')}: способ получения — ${f}.`, escalate: false };
  }
  if (/оплат|payment|to'lov|карт|налич/.test(q) && /заказ|мо[йе]|order/.test(q)) {
    const p = latest.payment === 'cash' ? 'наличные' : 'карта';
    return { answer: `${orderNumberLabel(latest, 'ru')}: оплата — ${p}.`, escalate: false };
  }
  if (/сколько|итого|total|summa|цена/.test(q) && /заказ|мо[йе]|order|сумм/.test(q)) {
    return { answer: `Сумма — ${orderNumberLabel(latest, 'ru')}: ${latest.total} UZS.`, escalate: false };
  }
  return { answer: null, escalate: true };
}

async function aiReply(text, orders, settings) {
  const rules = ruleBasedReply(text, orders, settings);
  if (rules.answer) return rules;
  if (rules.escalate === false) return rules;

  const key = process.env.OPENAI_API_KEY;
  if (!key) return { answer: null, escalate: true };

  const context = orders
    .slice(0, 5)
    .map((o) => `${orderNumberLabel(o, 'ru')} status=${o.status} total=${o.total} type=${o.type || 'cart'}`)
    .join('\n');
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'Ты вежливый помощник магазина handmade-украшений YouCanSmile (Ташкент). ' +
              'Отвечай кратко по-русски на базовые вопросы: доставка, самовывоз, оплата, сроки, каталог, статус заказа. ' +
              'Если нужен продавец или ты не уверен — ответь ровно: ESCALATE',
          },
          { role: 'user', content: `Заказы клиента:\n${context || 'нет'}\n\nВопрос: ${text}` },
        ],
        temperature: 0.2,
        max_tokens: 220,
      }),
    });
    const data = await res.json();
    const answer = data.choices?.[0]?.message?.content?.trim();
    if (!answer || /ESCALATE/i.test(answer)) return { answer: null, escalate: true };
    return { answer, escalate: false };
  } catch (_) {
    return { answer: null, escalate: true };
  }
}

module.exports = { aiReply, ruleBasedReply, faqReply };
