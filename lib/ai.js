const STATUS_LABELS = {
  new: 'Новый',
  processing: 'Обрабатывается',
  contacting: 'Скоро свяжется',
  in_progress: 'В процессе',
  done: 'Завершён',
  cancelled: 'Отменён',
};

function ruleBasedReply(text, orders) {
  const q = String(text || '').toLowerCase();
  const latest = orders[0];
  if (!latest) {
    if (/статус|заказ|order|status/.test(q)) {
      return { answer: 'У вас пока нет заказов на сайте. Оформите заказ в каталоге или напишите продавцу.', escalate: false };
    }
    return { answer: null, escalate: true };
  }
  const st = STATUS_LABELS[latest.status] || latest.status;
  if (/статус|где.*заказ|order status|buyurtma/.test(q)) {
    return { answer: `Ваш последний заказ #${latest.id} — статус: «${st}».`, escalate: false };
  }
  if (/доставк|delivery|yetkaz/.test(q)) {
    const f = latest.fulfillment === 'delivery' ? 'доставка' : 'самовывоз';
    return { answer: `Заказ #${latest.id}: способ получения — ${f}.`, escalate: false };
  }
  if (/оплат|payment|to'lov|карт|налич/.test(q)) {
    const p = latest.payment === 'cash' ? 'наличные' : 'карта';
    return { answer: `Заказ #${latest.id}: оплата — ${p}.`, escalate: false };
  }
  if (/сколько|итого|total|summa|цена/.test(q)) {
    return { answer: `Сумма заказа #${latest.id}: ${latest.total} UZS.`, escalate: false };
  }
  return { answer: null, escalate: true };
}

async function aiReply(text, orders) {
  const rules = ruleBasedReply(text, orders);
  if (rules.answer) return rules;
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { answer: null, escalate: true };
  const context = orders
    .slice(0, 5)
    .map((o) => `#${o.id} status=${o.status} total=${o.total} type=${o.type || 'cart'}`)
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
              'Ты помощник магазина украшений YouCanSmile. Отвечай кратко на русском об статусе заказа, доставке и оплате. Если не знаешь — ответь ровно: ESCALATE',
          },
          { role: 'user', content: `Заказы клиента:\n${context}\n\nВопрос: ${text}` },
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

module.exports = { aiReply, ruleBasedReply };
