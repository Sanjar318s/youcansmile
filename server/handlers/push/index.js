const { cors, json, readBody } = require(require('path').resolve(process.cwd(), 'lib/http'));
const { getSessionUser } = require(require('path').resolve(process.cwd(), 'lib/auth'));
const { vapidPublicKey, saveSubscription, removeSubscription, ensurePushSchema } = require(
  require('path').resolve(process.cwd(), 'lib/push')
);

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  try {
    await ensurePushSchema();
    if (req.method === 'GET') {
      const key = vapidPublicKey();
      if (!key) return json(res, 503, { error: 'vapid_not_configured' });
      return json(res, 200, { publicKey: key });
    }
    if (req.method === 'POST') {
      const me = await getSessionUser(req);
      if (!me) return json(res, 401, { error: 'auth' });
      const body = (await readBody(req)) || {};
      const endpoint = body.endpoint || (body.subscription && body.subscription.endpoint);
      const keys = body.keys || (body.subscription && body.subscription.keys);
      if (!endpoint || !keys) return json(res, 400, { error: 'bad_subscription' });
      const role = me.role === 'admin' ? 'admin' : 'customer';
      const userId = me.role === 'admin' ? 'admin' : me.id;
      await saveSubscription({ endpoint, keys, userId, role });
      return json(res, 200, { ok: true });
    }
    if (req.method === 'DELETE') {
      const me = await getSessionUser(req);
      if (!me) return json(res, 401, { error: 'auth' });
      const body = (await readBody(req)) || {};
      await removeSubscription(body.endpoint);
      return json(res, 200, { ok: true });
    }
    return json(res, 405, { error: 'method' });
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
};
