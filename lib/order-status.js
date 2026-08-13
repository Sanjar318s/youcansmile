const { uid } = require(require('path').resolve(process.cwd(), 'lib/db'));
const { saveOrder } = require(require('path').resolve(process.cwd(), 'lib/data'));
const {
  ORDER_STATUSES,
  normalizeStatus,
  statusLabelRu,
  orderNumberLabel,
} = require(require('path').resolve(process.cwd(), 'lib/orders'));
const { getOrCreateThread, saveMessage } = require(require('path').resolve(process.cwd(), 'lib/chat'));
const { notifyUser } = require(require('path').resolve(process.cwd(), 'lib/push'));

/**
 * Apply order status + notify customer (site chat + web push).
 * Shared by admin API and Telegram bot.
 */
async function applyOrderStatus(order, status, opts = {}) {
  const nextStatus = normalizeStatus(status);
  if (!ORDER_STATUSES.includes(String(status))) {
    const err = new Error('bad_status');
    err.code = 'bad_status';
    throw err;
  }
  const next = Object.assign({}, order, {
    status: nextStatus,
    updatedAt: Date.now(),
  });
  await saveOrder(next);

  let chatNotified = false;
  let pushNotified = false;
  if (next.customerId) {
    const label = orderNumberLabel(next, 'ru');
    const st = statusLabelRu(next.status);
    const site = String(opts.siteUrl || process.env.SITE_URL || process.env.VERCEL_URL || 'https://youcansmile.vercel.app')
      .replace(/\/$/, '')
      .replace(/^(?!https?:)/, 'https://');
    const statusUrl = `${site}/order-status.html?id=${encodeURIComponent(next.id)}`;
    const text = `${label}: статус «${st}».\nОтслеживать: ${statusUrl}`;
    try {
      const thread = await getOrCreateThread(next.customerId);
      await saveMessage({
        id: uid('m'),
        threadId: thread.id,
        author: 'seller',
        type: 'text',
        text,
        createdAt: Date.now(),
      });
      chatNotified = true;
    } catch (_) {}
    try {
      const results = await notifyUser(next.customerId, {
        title: 'YouCanSmile',
        body: `${label}: ${st}`,
        url: statusUrl,
        tag: `order-${next.id}`,
      });
      pushNotified = (results || []).some((r) => r.ok);
    } catch (_) {}
  }
  return Object.assign({}, next, { chatNotified, pushNotified });
}

module.exports = { applyOrderStatus };
