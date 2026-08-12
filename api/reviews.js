const { cors, json, readBody } = require('../lib/http');
const { getReviews, saveReview, getOrder, uid, normPhone } = require('../lib/data');

function orderHasProduct(order, productId) {
  return !!(order && Array.isArray(order.items) && order.items.some((i) => i.productId === productId));
}

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  try {
    if (req.method === 'GET') {
      const productId = req.query.productId || null;
      return json(res, 200, await getReviews(productId || undefined));
    }
    if (req.method === 'POST') {
      const body = (await readBody(req)) || {};
      const productId = String(body.productId || '').trim();
      const orderId = String(body.orderId || '').replace(/^#/, '').trim();
      const phone = normPhone(body.phone);
      const rating = Math.round(Number(body.rating) || 0);
      const text = String(body.text || '').trim();
      if (!productId) return json(res, 400, { ok: false, error: 'no_product' });
      if (!orderId) return json(res, 400, { ok: false, error: 'no_order' });
      if (phone.length < 9) return json(res, 400, { ok: false, error: 'no_phone' });
      if (rating < 1 || rating > 5) return json(res, 400, { ok: false, error: 'no_rating' });
      const order = await getOrder(orderId);
      if (!order) return json(res, 404, { ok: false, error: 'order_not_found' });
      if (order.status === 'cancelled') return json(res, 400, { ok: false, error: 'order_cancelled' });
      if (order.type === 'custom' || !orderHasProduct(order, productId)) {
        return json(res, 400, { ok: false, error: 'not_in_order' });
      }
      const orderPhone = normPhone(order.customer && order.customer.phone);
      if (!orderPhone || orderPhone !== phone) return json(res, 400, { ok: false, error: 'phone_mismatch' });
      const existing = await getReviews(productId);
      if (existing.some((r) => r.productId === productId && (r.orderId === orderId || normPhone(r.phone) === phone))) {
        return json(res, 400, { ok: false, error: 'already_reviewed' });
      }
      const review = {
        id: uid('r'),
        productId,
        orderId,
        phone,
        author: String((order.customer && order.customer.name) || '').trim(),
        rating,
        text,
        createdAt: Date.now(),
      };
      await saveReview(review);
      return json(res, 201, { ok: true, review });
    }
    return json(res, 405, { error: 'method' });
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
};
