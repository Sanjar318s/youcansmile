const path = require('path');
const { json } = require('../lib/http');

function load(rel) {
  return require(path.join(process.cwd(), 'server', 'handlers', rel));
}

function partsFromReq(req) {
  const q = req.query || {};
  if (Array.isArray(q.path)) return q.path.filter(Boolean);
  if (typeof q.path === 'string' && q.path) return [q.path];
  const url = (req.url || '').split('?')[0];
  return url.replace(/^\/?api\/?/, '').split('/').filter(Boolean);
}

module.exports = async (req, res) => {
  const parts = partsFromReq(req);
  const route = parts.join('/');
  if (!req.query || typeof req.query !== 'object') req.query = {};

  try {
    if (route === 'migrate') return load('migrate.js')(req, res);
    if (route === 'settings') return load('settings.js')(req, res);
    if (route === 'reviews') return load('reviews.js')(req, res);
    if (route === 'media') return load('media.js')(req, res);

    if (route === 'auth/login') return load('auth/login.js')(req, res);
    if (route === 'auth/register') return load('auth/register.js')(req, res);
    if (route === 'auth/logout') return load('auth/logout.js')(req, res);
    if (route === 'auth/me') return load('auth/me.js')(req, res);
    if (route === 'auth/profile') return load('auth/profile.js')(req, res);
    if (route === 'auth/google') return load('auth/google.js')(req, res);
    if (route === 'auth/google/callback') return load('auth/google/callback.js')(req, res);

    if (route === 'chat/thread') return load('chat/thread.js')(req, res);
    if (route === 'chat/messages') return load('chat/messages.js')(req, res);
    if (route === 'chat/close') return load('chat/close.js')(req, res);
    if (route === 'telegram/webhook') return load('telegram/webhook.js')(req, res);
    if (route === 'push' || route === 'push/subscribe') return load('push/index.js')(req, res);
    if (route === 'ping') return load('ping.js')(req, res);

    if (route === 'products') return load('products/index.js')(req, res);
    if (parts[0] === 'products' && parts[1]) {
      req.query.id = parts[1];
      return load('products/[id].js')(req, res);
    }

    if (route === 'categories') return load('categories/index.js')(req, res);
    if (parts[0] === 'categories' && parts[1]) {
      req.query.id = parts[1];
      return load('categories/[id].js')(req, res);
    }

    if (route === 'orders') return load('orders/index.js')(req, res);
    if (parts[0] === 'orders' && parts[1]) {
      req.query.id = parts[1];
      return load('orders/[id].js')(req, res);
    }

    return json(res, 404, { error: 'not_found', route });
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
};
