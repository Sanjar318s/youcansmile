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
} = require(require('path').resolve(process.cwd(), 'lib/chat'));
const {
  sendTelegram,
  answerCallback,
  registerSellerChat,
  sendSellerHelp,
  sellerMainKeyboard,
  chatListKeyboard,
  liveKeyboard,
  escHtml,
  shortId,
  customerLabel,
} = require(require('path').resolve(process.cwd(), 'lib/telegram'));

function parsePrefix(raw) {
  const s = String(raw || '');
  const m = s.match(/ycs:([^:\s]+):([^\s]+)/);
  if (!m) return null;
  return { threadId: m[1], msgId: m[2] };
}

function isMenuText(t) {
  const s = String(t || '').trim();
  return (
    s === '📋 Чаты' ||
    s === '🔌 Отключиться' ||
    s === 'ℹ️ Статус' ||
    s === '❓ Помощь' ||
    s === '/chats' ||
    s === '/menu' ||
    s === '/status' ||
    s === '/disconnect' ||
    s === '/help' ||
    s === '/start' ||
    s.startsWith('/start ') ||
    s.startsWith('/connect')
  );
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

async function handleMenuCommand(chatId, rawText) {
  const t = String(rawText || '').trim();
  if (t === '/start' || t.startsWith('/start ')) {
    await registerSellerChat(chatId);
    await sendSellerHelp(chatId);
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

    if (update.callback_query) {
      await handleCallback(update.callback_query);
      return json(res, 200, { ok: true, callback: true });
    }

    const msg = update.message || update.edited_message;
    if (!msg) return json(res, 200, { ok: true });

    const chatId = msg.chat?.id;
    if (!chatId) return json(res, 200, { ok: true });

    // Bind seller chat on any interaction from this chat once registered via /start
    // Menu commands
    if (msg.text && isMenuText(msg.text)) {
      const handled = await handleMenuCommand(chatId, msg.text);
      if (handled) return json(res, 200, { ok: true, menu: true });
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
      await sendTelegram({
        chat_id: chatId,
        text:
          'Сначала подключитесь к чату клиента.\nНажмите «📋 Чаты» или кнопку «Подключиться» под запросом.',
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

    return json(res, 200, { ok: true });
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
};
