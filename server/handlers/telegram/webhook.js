const { cors, json, readBody, text } = require(require('path').resolve(process.cwd(), 'lib/http'));
const { uid } = require(require('path').resolve(process.cwd(), 'lib/db'));
const {
  saveMessage,
  getThreadById,
  saveMedia,
  setSellerConnected,
  getConnectedThread,
  listSellerThreads,
  getCustomerBrief,
  getMessages,
  setNeedsSeller,
  getOrCreateThread,
} = require(require('path').resolve(process.cwd(), 'lib/chat'));
const {
  sendTelegram,
  answerCallback,
  registerSellerChat,
  sendSellerHelp,
  sellerMainKeyboard,
  chatListKeyboard,
  liveKeyboard,
  connectKeyboard,
  ordersHubKeyboard,
  ordersListKeyboard,
  orderStatusKeyboard,
  formatOrderDetails,
  escHtml,
  shortId,
  customerLabel,
  getSellerChatId,
  getSellerChatIds,
  isAllowedTelegramUser,
  isOwnerUsername,
  normUser,
  addAllowedUser,
  deleteAllowedUser,
} = require(require('path').resolve(process.cwd(), 'lib/telegram'));
const { getOrder, getOrders, getOrdersByStatus, getOrderByNumber, getSettings, saveSettings } = require(
  require('path').resolve(process.cwd(), 'lib/data')
);
const { ORDER_STATUSES, statusLabelRu, orderNumber } = require(require('path').resolve(process.cwd(), 'lib/orders'));
const { applyOrderStatus } = require(require('path').resolve(process.cwd(), 'lib/order-status'));

function parsePrefix(raw) {
  const s = String(raw || '');
  const m = s.match(/ycs:([^:\s]+):([^\s]+)/);
  if (!m) return null;
  return { threadId: m[1], msgId: m[2] };
}

function isMenuText(t) {
  const s = String(t || '').trim();
  return (
    s === '📦 Заказы' ||
    s === '🔎 Поиск заказа' ||
    s === '📋 Чаты' ||
    s === '🔌 Отключиться' ||
    s === 'ℹ️ Статус' ||
    s === '❓ Помощь' ||
    s === '/orders' ||
    s === '/find' ||
    s === '/chats' ||
    s === '/menu' ||
    s === '/status' ||
    s === '/disconnect' ||
    s === '/help' ||
    s === '/start' ||
    s.startsWith('/start ') ||
    s.startsWith('/connect') ||
    s === '➕ Добавить пользователя' ||
    s === '➖ Удалить пользователя' ||
    s === '/adduser' ||
    s === '/deluser'
  );
}

async function assertSellerChat(chatId) {
  const ids = await getSellerChatIds();
  const single = String((await getSellerChatId()) || process.env.TELEGRAM_SELLER_CHAT_ID || '');
  const all = ids.length ? ids : [single].filter(Boolean);
  if (!all.length) return true;
  return all.includes(String(chatId));
}

function mergeInline(...kbs) {
  const rows = [];
  for (const kb of kbs) {
    if (kb && Array.isArray(kb.inline_keyboard)) rows.push(...kb.inline_keyboard);
  }
  return rows.length ? { inline_keyboard: rows } : undefined;
}

async function setPendingAction(chatId, action) {
  try {
    const s = (await getSettings()) || {};
    await saveSettings({ ...s, telegramPendingAction: { chatId: String(chatId), action, ts: Date.now() } });
  } catch (_) {}
}

async function clearPendingAction() {
  try {
    const s = (await getSettings()) || {};
    if (!s.telegramPendingAction) return;
    const { telegramPendingAction: _drop, ...rest } = s;
    await saveSettings(rest);
  } catch (_) {}
}

function looksLikeUsername(raw) {
  const u = normUser(raw);
  return /^[a-z][a-z0-9_]{4,31}$/.test(u) ? u : '';
}

async function orderCounts() {
  const all = await getOrders();
  const counts = {};
  for (const s of ORDER_STATUSES) counts[s] = 0;
  for (const o of all || []) {
    const st = ORDER_STATUSES.includes(o.status) ? o.status : 'new';
    counts[st] = (counts[st] || 0) + 1;
  }
  return counts;
}

async function sendOrdersHub(chatId) {
  const counts = await orderCounts();
  return sendTelegram({
    chat_id: chatId,
    parse_mode: 'HTML',
    text: '<b>📦 Заказы</b>\nВыберите раздел по статусу или поиск по номеру:',
    reply_markup: ordersHubKeyboard(counts),
  });
}

async function sendOrdersList(chatId, status) {
  const st = ORDER_STATUSES.includes(status) ? status : 'new';
  const orders = await getOrdersByStatus(st, 15);
  if (!orders.length) {
    return sendTelegram({
      chat_id: chatId,
      parse_mode: 'HTML',
      text: `В разделе «${escHtml(statusLabelRu(st))}» пока пусто.`,
      reply_markup: ordersListKeyboard([], st),
    });
  }
  const lines = orders.map((o, i) => {
    const who = (o.customer && (o.customer.contact || o.customer.name || o.customer.phone)) || '—';
    return `${i + 1}. <b>#${escHtml(orderNumber(o))}</b> · ${escHtml(String(who).slice(0, 40))}`;
  });
  return sendTelegram({
    chat_id: chatId,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    text:
      `<b>${escHtml(statusLabelRu(st))}</b> (${orders.length})\n\n` +
      lines.join('\n') +
      `\n\nОткройте заказ кнопкой ниже:`,
    reply_markup: ordersListKeyboard(orders, st),
  });
}

async function sendOrderCard(chatId, order) {
  const text = await formatOrderDetails(order);
  let connectKb;
  try {
    if (order.customerId) {
      const thread = await getOrCreateThread(order.customerId);
      connectKb = connectKeyboard(thread.id);
    }
  } catch (_) {}
  return sendTelegram({
    chat_id: chatId,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: mergeInline(orderStatusKeyboard(order), connectKb),
    text,
  });
}

async function tryOrderNumberLookup(chatId, rawText) {
  const digits = String(rawText || '').replace(/\D/g, '');
  if (digits.length < 4 || digits.length > 6) return false;
  if (!/^\d{4,6}$/.test(String(rawText || '').trim().replace(/\s/g, ''))) return false;
  const order = await getOrderByNumber(digits);
  if (!order) {
    await sendTelegram({
      chat_id: chatId,
      text: `Заказ №${digits.padStart(6, '0')} не найден.`,
      reply_markup: sellerMainKeyboard(),
    });
    return true;
  }
  await sendOrderCard(chatId, order);
  return true;
}

async function downloadTelegramFile(fileId) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !fileId) return null;
  const info = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`).then((r) =>
    r.json()
  );
  const path = info.result?.file_path;
  if (!path) return null;
  const url = `https://api.telegram.org/file/bot${token}/${path}`;
  const buf = await fetch(url).then((r) => r.arrayBuffer());
  const b64 = Buffer.from(buf).toString('base64');
  let mime = 'application/octet-stream';
  if (path.endsWith('.ogg') || path.includes('voice')) mime = 'audio/ogg';
  else if (path.match(/\.(jpg|jpeg)$/i)) mime = 'image/jpeg';
  else if (path.match(/\.png$/i)) mime = 'image/png';
  else if (path.match(/\.webp$/i)) mime = 'image/webp';
  else if (path.match(/\.webm$/i)) mime = 'audio/webm';
  else if (path.match(/\.mp4$/i)) mime = 'video/mp4';
  return { data: `data:${mime};base64,${b64}`, mime };
}

async function threadTitle(thread) {
  if (!thread) return 'чат';
  const c = await getCustomerBrief(thread.customer_id);
  return customerLabel(c) || shortId(thread.id);
}

async function sendChatsList(chatId) {
  const threads = await listSellerThreads(15);
  const active = await getConnectedThread();
  if (!threads.length) {
    return sendTelegram({
      chat_id: chatId,
      text: 'Пока нет диалогов.\nКогда клиенту понадобится продавец — чат появится здесь.',
      reply_markup: sellerMainKeyboard(),
    });
  }
  const lines = threads.map((t, i) => {
    const mark = t.seller_connected ? '🟢' : t.needs_seller ? '🟡' : '⚪';
    const name = t.customer_name || t.customer_phone || shortId(t.id);
    const preview = String(t.last_text || t.last_type || '—').replace(/\s+/g, ' ').slice(0, 42);
    return `${i + 1}. ${mark} <b>${escHtml(name)}</b>\n    <i>${escHtml(preview)}</i>`;
  });
  return sendTelegram({
    chat_id: chatId,
    parse_mode: 'HTML',
    text:
      `<b>Диалоги клиентов</b>\n` +
      `🟢 подключены · 🟡 ждут продавца · ⚪ остальные\n\n` +
      lines.join('\n\n') +
      `\n\nВыберите чат кнопкой ниже:`,
    reply_markup: chatListKeyboard(threads, active?.id),
    disable_web_page_preview: true,
  });
}

async function sendStatus(chatId) {
  const active = await getConnectedThread();
  if (!active) {
    return sendTelegram({
      chat_id: chatId,
      text: 'Сейчас вы не подключены ни к одному чату.\nОткройте «📋 Чаты» и выберите клиента.',
      reply_markup: sellerMainKeyboard(),
    });
  }
  const name = await threadTitle(active);
  return sendTelegram({
    chat_id: chatId,
    parse_mode: 'HTML',
    text:
      `🟢 <b>Подключены к чату</b>\n` +
      `👤 ${escHtml(name)}\n` +
      `Пишите сообщения сюда — они появятся у клиента на сайте.\n` +
      `Чтобы выйти: «🔌 Отключиться».`,
    reply_markup: liveKeyboard(active.id),
  });
}

async function doConnect(chatId, threadId) {
  const thread = await getThreadById(threadId);
  if (!thread) {
    return sendTelegram({ chat_id: chatId, text: 'Чат не найден.' });
  }
  await setSellerConnected(threadId, true);
  await setNeedsSeller(threadId, true);
  const name = await threadTitle(thread);
  const recent = await getMessages(threadId, 0);
  const last = recent.slice(-6);
  const history = last
    .map((m) => {
      const who = m.author === 'customer' ? '👤' : m.author === 'seller' ? '🧑‍💼' : '🤖';
      const body =
        m.type === 'text'
          ? m.text
          : m.type === 'photo'
            ? '📷 фото'
            : m.type === 'voice'
              ? '🎤 голос'
              : m.type === 'location'
                ? '📍 локация'
                : m.type;
      return `${who} ${escHtml(String(body || '').slice(0, 120))}`;
    })
    .join('\n');

  return sendTelegram({
    chat_id: chatId,
    parse_mode: 'HTML',
    reply_markup: liveKeyboard(threadId),
    text:
      `🟢 <b>Подключены</b> к чату <b>${escHtml(name)}</b>\n` +
      `Теперь ваши сообщения уходят этому клиенту.\n\n` +
      (history ? `<b>Недавние сообщения:</b>\n${history}\n\n` : '') +
      `Напишите ответ ниже 👇\n` +
      `<i>Отключиться — когда закончите.</i>`,
  });
}

async function doDisconnect(chatId) {
  const active = await getConnectedThread();
  if (!active) {
    return sendTelegram({
      chat_id: chatId,
      text: 'Вы и так не подключены.',
      reply_markup: sellerMainKeyboard(),
    });
  }
  const name = await threadTitle(active);
  await setSellerConnected(active.id, false);
  return sendTelegram({
    chat_id: chatId,
    parse_mode: 'HTML',
    text: `🔌 Отключились от чата <b>${escHtml(name)}</b>.\nБот снова сам отвечает на базовые вопросы.`,
    reply_markup: sellerMainKeyboard(),
  });
}

async function handleMenuCommand(msg) {
  const chatId = msg?.chat?.id;
  const rawText = msg?.text;
  const t = String(rawText || '').trim();
  if (t === '/start' || t.startsWith('/start ')) {
    await registerSellerChat(chatId, msg.from?.username);
    await sendSellerHelp(chatId);
    return true;
  }
  if (t === '📦 Заказы' || t === '/orders') {
    await sendOrdersHub(chatId);
    return true;
  }
  if (t === '🔎 Поиск заказа' || t === '/find') {
    await sendTelegram({
      chat_id: chatId,
      text: '🔎 Пришлите 6-значный номер заказа сообщением (например 123456).',
      reply_markup: sellerMainKeyboard(),
    });
    return true;
  }
  if (t === '📋 Чаты' || t === '/chats' || t === '/menu') {
    await sendChatsList(chatId);
    return true;
  }
  if (t === '🔌 Отключиться' || t === '/disconnect') {
    await doDisconnect(chatId);
    return true;
  }
  if (t === 'ℹ️ Статус' || t === '/status') {
    await sendStatus(chatId);
    return true;
  }
  if (t === '❓ Помощь' || t === '/help') {
    await sendSellerHelp(chatId);
    return true;
  }
  if (t === '➕ Добавить пользователя' || t === '/adduser') {
    if (!isOwnerUsername(msg.from && msg.from.username)) {
      await sendTelegram({
        chat_id: chatId,
        text: '⛔ Управление пользователями доступно только владельцам.',
        reply_markup: sellerMainKeyboard(),
      });
      return true;
    }
    await setPendingAction(chatId, 'add');
    await sendTelegram({
      chat_id: chatId,
      text: '👤 Пришлите @username нового пользователя.\nОн будет получать уведомления и сможет отвечать в чаты.\n«❌ Отмена» — отменить.',
    });
    return true;
  }
  if (t === '➖ Удалить пользователя' || t === '/deluser') {
    if (!isOwnerUsername(msg.from && msg.from.username)) {
      await sendTelegram({
        chat_id: chatId,
        text: '⛔ Управление пользователями доступно только владельцам.',
        reply_markup: sellerMainKeyboard(),
      });
      return true;
    }
    await setPendingAction(chatId, 'del');
    await sendTelegram({
      chat_id: chatId,
      text: '👤 Пришлите @username пользователя, которого нужно удалить.\n«❌ Отмена» — отменить.',
    });
    return true;
  }
  if (t.startsWith('/connect')) {
    const id = t.split(/\s+/)[1];
    if (!id) {
      await sendChatsList(chatId);
      return true;
    }
    await doConnect(chatId, id);
    return true;
  }
  return false;
}

async function handleCallback(cq) {
  const chatId = cq.message?.chat?.id;
  const data = String(cq.data || '');
  await answerCallback(cq.id, '');
  if (!chatId) return;

  if (data === 'chats') {
    await sendChatsList(chatId);
    return;
  }
  if (data === 'disconnect') {
    await doDisconnect(chatId);
    return;
  }
  if (data.startsWith('connect:')) {
    const threadId = data.slice('connect:'.length);
    await doConnect(chatId, threadId);
    return;
  }
  if (data === 'orders:hub' || data === 'orders') {
    await sendOrdersHub(chatId);
    return;
  }
  if (data === 'orders:search') {
    await sendTelegram({
      chat_id: chatId,
      text: '🔎 Пришлите 6-значный номер заказа сообщением (например 123456).',
      reply_markup: sellerMainKeyboard(),
    });
    return;
  }
  if (data.startsWith('orders:')) {
    const status = data.slice('orders:'.length);
    if (ORDER_STATUSES.includes(status)) {
      await sendOrdersList(chatId, status);
    }
    return;
  }
  if (data.startsWith('ostatus:')) {
    if (!(await assertSellerChat(chatId))) {
      await sendTelegram({ chat_id: chatId, text: 'Нет доступа.' });
      return;
    }
    const parts = data.split(':');
    const orderId = parts[1];
    const nextStatus = parts[2];
    const order = await getOrder(orderId);
    if (!order) {
      await sendTelegram({ chat_id: chatId, text: 'Заказ не найден.' });
      return;
    }
    try {
      const updated = await applyOrderStatus(order, nextStatus);
      await sendOrderCard(chatId, updated);
    } catch (e) {
      await sendTelegram({
        chat_id: chatId,
        text: e && e.code === 'bad_status' ? 'Некорректный статус.' : 'Не удалось обновить статус.',
      });
    }
    return;
  }
  if (data.startsWith('order:')) {
    const orderId = data.slice('order:'.length);
    const order = await getOrder(orderId);
    if (!order) {
      await sendTelegram({ chat_id: chatId, text: 'Заказ не найден.' });
      return;
    }
    await sendOrderCard(chatId, order);
  }
}

async function buildSellerInbound(msg, threadId, replyToId) {
  let type = 'text';
  let mediaUrl = '';
  let bodyText = String(msg.text || msg.caption || '')
    .replace(/ycs:[^\s]+\s*/g, '')
    .trim();
  let lat = null;
  let lng = null;

  if (msg.photo && msg.photo.length) {
    type = 'photo';
    const file = msg.photo[msg.photo.length - 1];
    const dl = await downloadTelegramFile(file.file_id);
    if (dl) {
      const mediaId = uid('md');
      await saveMedia({ id: mediaId, mime: dl.mime, data: dl.data });
      mediaUrl = `/api/media?id=${mediaId}`;
    }
  } else if (msg.voice || msg.audio) {
    type = 'voice';
    const fileId = (msg.voice || msg.audio).file_id;
    const dl = await downloadTelegramFile(fileId);
    if (dl) {
      const mediaId = uid('md');
      const mime = msg.voice ? 'audio/ogg' : dl.mime || 'audio/ogg';
      await saveMedia({ id: mediaId, mime, data: dl.data });
      mediaUrl = `/api/media?id=${mediaId}`;
    }
  } else if (msg.location || msg.venue) {
    type = 'location';
    const loc = msg.location || msg.venue.location;
    lat = loc.latitude;
    lng = loc.longitude;
    if (msg.venue && msg.venue.title) {
      bodyText = [msg.venue.title, msg.venue.address, bodyText].filter(Boolean).join('\n');
    }
  }

  if (type === 'text' && !bodyText) return null;

  return {
    id: uid('m'),
    threadId,
    author: 'seller',
    type,
    text: bodyText,
    mediaUrl,
    lat,
    lng,
    replyToId: replyToId || null,
    createdAt: Date.now(),
  };
}

module.exports = async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return text(res, 405, 'method');
  try {
    const update = (await readBody(req)) || {};

    const gateFrom = update.message?.from || update.edited_message?.from || update.callback_query?.from;
    if (gateFrom && !(await isAllowedTelegramUser(gateFrom))) {
      if (update.callback_query) {
        await answerCallback(update.callback_query.id, '⛔ Нет доступа');
      } else {
        const denyChatId = update.message?.chat?.id || update.edited_message?.chat?.id;
        if (denyChatId) {
          await sendTelegram({ chat_id: denyChatId, text: '⛔ У вас нет доступа к этому боту.' });
        }
      }
      return json(res, 200, { ok: true, denied: true });
    }

    if (update.callback_query) {
      await handleCallback(update.callback_query);
      return json(res, 200, { ok: true, callback: true });
    }

    const msg = update.message || update.edited_message;
    if (!msg) return json(res, 200, { ok: true });
    if (!gateFrom) return json(res, 200, { ok: true, skip: 'no_from' });

    const chatId = msg.chat?.id;
    if (!chatId) return json(res, 200, { ok: true });

    // Menu commands
    if (msg.text && isMenuText(msg.text)) {
      const handled = await handleMenuCommand(msg);
      if (handled) return json(res, 200, { ok: true, menu: true });
    }

    // Owner user-management flow (pending add/del), before any chat routing
    const pending = (await getSettings().catch(() => null))?.telegramPendingAction;
    if (
      pending &&
      isOwnerUsername(msg.from && msg.from.username) &&
      String(pending.chatId) === String(chatId)
    ) {
      if (msg.text && String(msg.text).trim() === '❌ Отмена') {
        await clearPendingAction();
        await sendTelegram({ chat_id: chatId, text: 'Отменено.' });
        return json(res, 200, { ok: true, pending: true });
      }
      const uname = msg.text ? looksLikeUsername(msg.text) : '';
      if (uname && Date.now() - Number(pending.ts || 0) <= 120000) {
        if (pending.action === 'add') {
          const r = await addAllowedUser(uname);
          const text =
            r.ok
              ? `✅ @${uname} добавлен. Он получает уведомления и может отвечать в чаты.`
              : r.error === 'owner'
                ? `⛔ @${uname} — владелец, его нельзя добавить/удалить.`
                : r.error === 'exists'
                  ? `ℹ️ @${uname} уже в списке.`
                  : 'Не удалось добавить.';
          await clearPendingAction();
          await sendTelegram({ chat_id: chatId, text });
        } else if (pending.action === 'del') {
          const r = await deleteAllowedUser(uname);
          const text =
            r.ok
              ? `🗑️ @${uname} удалён и больше не получает уведомления.`
              : r.error === 'owner'
                ? `⛔ @${uname} — владелец, удалить нельзя.`
                : r.error === 'missing'
                  ? `ℹ️ @${uname} не в списке.`
                  : 'Не удалось удалить.';
          await clearPendingAction();
          await sendTelegram({ chat_id: chatId, text });
        }
        return json(res, 200, { ok: true, users: true });
      }
      if (msg.text) {
        if (uname) {
          await clearPendingAction();
          await sendTelegram({
            chat_id: chatId,
            text: '⏳ Время на ввод истекло. Нажмите кнопку ещё раз.',
            reply_markup: sellerMainKeyboard(),
          });
        } else {
          await sendTelegram({
            chat_id: chatId,
            text: 'Это не похоже на @username. Пришлите username (например @someone) или «❌ Отмена».',
          });
        }
        return json(res, 200, { ok: true, pending: true });
      }
    }

    // Order number search (4–6 digits) when not routing as a chat reply
    if (msg.text && /^\d{4,6}$/.test(String(msg.text).trim())) {
      const activeForSearch = await getConnectedThread();
      const hasPrefix =
        !!parsePrefix(msg.text) ||
        !!(msg.reply_to_message && parsePrefix(msg.reply_to_message.text || msg.reply_to_message.caption || ''));
      if (!activeForSearch && !hasPrefix) {
        const found = await tryOrderNumberLookup(chatId, msg.text);
        if (found) return json(res, 200, { ok: true, orderSearch: true });
      }
    }

    // 1) Reply-to or inline ycs: prefix (works even if not connected)
    let prefix = parsePrefix(msg.text || msg.caption || '');
    if (!prefix && msg.reply_to_message) {
      prefix = parsePrefix(msg.reply_to_message.text || msg.reply_to_message.caption || '');
    }

    let threadId = prefix?.threadId || null;
    let replyToId = prefix?.msgId || null;

    // 2) If seller is connected — route free-form messages to active thread
    if (!threadId) {
      const active = await getConnectedThread();
      if (active) {
        threadId = active.id;
      }
    }

    if (!threadId) {
      if (msg.text && (await tryOrderNumberLookup(chatId, msg.text))) {
        return json(res, 200, { ok: true, orderSearch: true });
      }
      await sendTelegram({
        chat_id: chatId,
        text:
          'Сначала подключитесь к чату клиента.\nНажмите «📋 Чаты» или кнопку «Подключиться» под запросом.\nИли «📦 Заказы» / номер заказа для поиска.',
        reply_markup: sellerMainKeyboard(),
      });
      return json(res, 200, { ok: true, skip: 'no_thread' });
    }

    const thread = await getThreadById(threadId);
    if (!thread) return json(res, 200, { ok: true, skip: 'no_thread' });

    const sellerMsg = await buildSellerInbound(msg, threadId, replyToId);
    if (!sellerMsg) return json(res, 200, { ok: true, skip: 'empty' });

    await saveMessage(sellerMsg);
    // Auto-connect when seller replies into a thread
    if (!Number(thread.seller_connected)) {
      await setSellerConnected(threadId, true);
    }
    await setNeedsSeller(threadId, false);

    try {
      const { notifyUser } = require(require('path').resolve(process.cwd(), 'lib/push'));
      const preview =
        sellerMsg.type === 'text'
          ? String(sellerMsg.text || '').slice(0, 100)
          : sellerMsg.type === 'photo'
            ? '📷 Фото от продавца'
            : sellerMsg.type === 'voice'
              ? '🎤 Голосовое от продавца'
              : 'Сообщение от продавца';
      await notifyUser(thread.customer_id, {
        title: 'YouCanSmile',
        body: preview,
        url: '/',
        tag: `chat-seller-${threadId}`,
      });
    } catch (_) {}

    return json(res, 200, { ok: true });
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
};
