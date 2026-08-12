const { cors, json, readBody } = require('../lib/http');
const { ensureSeeded } = require('../lib/seed');
const { getSettings, saveSettings } = require('../lib/data');

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  try {
    await ensureSeeded();
    if (req.method === 'GET') {
      const s = await getSettings();
      return json(res, 200, s || {});
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
