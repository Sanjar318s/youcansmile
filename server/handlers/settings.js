const { cors, json, readBody } = require(require('path').resolve(process.cwd(), 'lib/http'));
const { ensureSeeded } = require(require('path').resolve(process.cwd(), 'lib/seed'));
const { getSettings, saveSettings } = require(require('path').resolve(process.cwd(), 'lib/data'));

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  try {
    await ensureSeeded();
    if (req.method === 'GET') {
      const s = await getSettings();
      return json(res, 200, s || {}, {
        'Cache-Control': 'public, max-age=30, s-maxage=60',
      });
    }
    if (req.method === 'PUT') {
      const body = (await readBody(req)) || {};
      await saveSettings(body);
      return json(res, 200, body);
    }
    return json(res, 405, { error: 'method' });
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
};
