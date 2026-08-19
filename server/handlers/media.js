const { cors, json, readBody } = require(require('path').resolve(process.cwd(), 'lib/http'));
const { uid } = require(require('path').resolve(process.cwd(), 'lib/db'));
const { saveMedia, getMedia } = require(require('path').resolve(process.cwd(), 'lib/chat'));
const { requireAdmin } = require(require('path').resolve(process.cwd(), 'lib/admin-guard'));

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  try {
    if (req.method === 'GET') {
      const id = req.query.id;
      if (!id) return json(res, 400, { error: 'missing_id' });
      const row = await getMedia(id);
      if (!row) return json(res, 404, { error: 'not_found' });
      const raw = row.data;
      if (raw.startsWith('data:')) {
        const m = raw.match(/^data:([^;]+);base64,(.+)$/);
        if (m) {
          res.statusCode = 200;
          res.setHeader('Content-Type', m[1]);
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          res.end(Buffer.from(m[2], 'base64'));
          return;
        }
      }
      res.statusCode = 200;
      res.setHeader('Content-Type', row.mime || 'application/octet-stream');
      res.end(Buffer.from(raw, 'base64'));
      return;
    }
    if (req.method === 'POST') {
      if (!(await requireAdmin(req, res))) return;
      const body = (await readBody(req)) || {};
      let mime = body.mime || 'application/octet-stream';
      let data = body.data || '';
      if (!data) return json(res, 400, { error: 'no_data' });
      if (!data.startsWith('data:')) data = `data:${mime};base64,${data}`;
      const id = uid('md');
      await saveMedia({ id, mime, data });
      return json(res, 201, { ok: true, id, url: `/api/media?id=${id}` });
    }
    return json(res, 405, { error: 'method' });
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
};
