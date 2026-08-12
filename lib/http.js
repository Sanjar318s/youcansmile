const crypto = require('crypto');

function json(res, status, data, extraHeaders = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  Object.entries(extraHeaders).forEach(([k, v]) => res.setHeader(k, v));
  res.end(JSON.stringify(data));
}

function text(res, status, body, contentType = 'text/plain') {
  res.statusCode = status;
  res.setHeader('Content-Type', contentType);
  res.end(body);
}

function redirect(res, url) {
  res.statusCode = 302;
  res.setHeader('Location', url);
  res.end();
}

function cors(req, res) {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return true;
  }
  return false;
}

async function readBody(req) {
  // Vercel / some runtimes pre-parse JSON onto req.body (object or string).
  if (req.body != null && req.body !== '') {
    if (Buffer.isBuffer(req.body)) {
      const raw = req.body.toString('utf8');
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch (_) {
        return raw;
      }
    }
    if (typeof req.body === 'object') return req.body;
    if (typeof req.body === 'string') {
      const raw = req.body.trim();
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch (_) {
        return raw;
      }
    }
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return raw;
  }
}

function baseUrl(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, '');
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = (req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  if (host) return `${proto}://${host}`.replace(/\/$/, '');
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`.replace(/\/$/, '');
  return 'http://localhost:3000';
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  header.split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i === -1) return;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    out[k] = decodeURIComponent(v);
  });
  return out;
}

function setCookie(res, name, value, opts = {}) {
  const maxAge = opts.maxAge ?? 60 * 60 * 24 * 90;
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
    `Expires=${new Date(Date.now() + maxAge * 1000).toUTCString()}`,
  ];
  const secure =
    opts.secure ??
    !!(process.env.VERCEL_URL || String(process.env.SITE_URL || '').startsWith('https'));
  if (secure) parts.push('Secure');
  const prev = res.getHeader('Set-Cookie');
  const next = parts.join('; ');
  if (!prev) res.setHeader('Set-Cookie', next);
  else if (Array.isArray(prev)) res.setHeader('Set-Cookie', [...prev, next]);
  else res.setHeader('Set-Cookie', [prev, next]);
}

function clearCookie(res, name) {
  setCookie(res, name, '', { maxAge: 0 });
}

function hashPassword(password) {
  const secret = process.env.SESSION_SECRET || 'ycs-dev-secret';
  return crypto.createHash('sha256').update(`${secret}:${password}`).digest('hex');
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

module.exports = {
  json,
  text,
  redirect,
  cors,
  readBody,
  baseUrl,
  parseCookies,
  setCookie,
  clearCookie,
  hashPassword,
  safeEqual,
};
