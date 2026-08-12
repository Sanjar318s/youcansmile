const { cors, json } = require(require('path').resolve(process.cwd(), 'lib/http'));
const { getSessionUser } = require(require('path').resolve(process.cwd(), 'lib/auth'));
const { getOrCreateThread, getMessages } = require(require('path').resolve(process.cwd(), 'lib/chat'));

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'GET') return json(res, 405, { error: 'method' });
  try {
    const me = await getSessionUser(req);
    if (!me || me.role !== 'customer') return json(res, 401, { error: 'auth' });
    const thread = await getOrCreateThread(me.id);
    const since = req.query.since || 0;
    const messages = await getMessages(thread.id, since);
    return json(res, 200, {
      thread: { id: thread.id, needsSeller: !!thread.needs_seller },
      messages,
    });
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
};
