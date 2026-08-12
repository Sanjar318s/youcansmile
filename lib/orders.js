/* Order number helpers — human 6-digit display, internal id for URLs */
const ORDER_STATUSES = ['new', 'processing', 'contacting', 'in_progress', 'done', 'cancelled'];

const STATUS_LABEL_RU = {
  new: 'Новый',
  processing: 'Обрабатывается',
  contacting: 'Скоро свяжется',
  in_progress: 'В процессе',
  done: 'Завершён',
  cancelled: 'Отменён',
};

function normalizeStatus(status) {
  return ORDER_STATUSES.includes(status) ? status : 'new';
}

function statusLabelRu(status) {
  return STATUS_LABEL_RU[normalizeStatus(status)] || STATUS_LABEL_RU.new;
}

/** Deterministic 6-digit fallback from internal id (for legacy orders). */
function numberFromId(id) {
  const s = String(id || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return String(100000 + (h % 900000));
}

function orderNumber(order) {
  if (!order) return '000000';
  const n = order.number != null ? String(order.number).replace(/\D/g, '') : '';
  if (n.length >= 6) return n.slice(-6);
  if (n.length > 0) return n.padStart(6, '0');
  return numberFromId(order.id);
}

function orderNumberLabel(order, lang) {
  const num = orderNumber(order);
  if (lang === 'en') return `Order number ${num}`;
  if (lang === 'uz') return `Buyurtma raqami ${num}`;
  return `Номер заказа ${num}`;
}

async function allocOrderNumber(getDb) {
  const db = getDb();
  for (let attempt = 0; attempt < 12; attempt++) {
    const n = String(100000 + Math.floor(Math.random() * 900000));
    try {
      const row = await db.execute({
        sql: `SELECT id FROM orders WHERE json_extract(data, '$.number') = ? LIMIT 1`,
        args: [n],
      });
      if (!row.rows.length) return n;
    } catch (_) {
      // json_extract may fail on empty DB — still use candidate
      return n;
    }
  }
  return String(100000 + (Date.now() % 900000));
}

module.exports = {
  ORDER_STATUSES,
  STATUS_LABEL_RU,
  normalizeStatus,
  statusLabelRu,
  numberFromId,
  orderNumber,
  orderNumberLabel,
  allocOrderNumber,
};
