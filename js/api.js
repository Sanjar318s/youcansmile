/* ============================================================
   YoucanSmile — единый API-слой доступа к данным
   ------------------------------------------------------------
   Сейчас:  mode = 'local'  -> всё хранится в localStorage.
   В конце: mode = 'remote' -> запросы уходят на Vercel-функции
   (/api/*), которые читают/пишут базу Turso. Ничего не меняется
   в остальном коде — только переключается флаг.
   ============================================================ */

const Api = {
  mode: (function () {
    const h = typeof location !== 'undefined' ? location.hostname : '';
    const p = typeof location !== 'undefined' ? location.port : '';
    if (h === 'localhost' && p === '3000') return 'remote';
    return h && h !== 'localhost' && h !== '127.0.0.1' ? 'remote' : 'local';
  })(),
  baseUrl: '',

  _mem: Object.create(null),
  _memInflight: Object.create(null),

  _cacheGet(key, loader) {
    if (Object.prototype.hasOwnProperty.call(this._mem, key)) {
      return Promise.resolve(this._mem[key]);
    }
    if (!this._memInflight[key]) {
      this._memInflight[key] = Promise.resolve()
        .then(loader)
        .then((value) => {
          this._mem[key] = value;
          delete this._memInflight[key];
          return value;
        })
        .catch((err) => {
          delete this._memInflight[key];
          throw err;
        });
    }
    return this._memInflight[key];
  },

  invalidateCache(keys) {
    const list = keys && keys.length ? keys : Object.keys(this._mem).concat(Object.keys(this._memInflight));
    list.forEach((k) => {
      delete this._mem[k];
      delete this._memInflight[k];
    });
  },

  KEYS: {
    products: 'ycs_products',
    categories: 'ycs_categories',
    settings: 'ycs_settings',
    orders: 'ycs_orders',
    reviews: 'ycs_reviews',
    session: 'ycs_session',
    seed: 'ycs_seed_ver',
  },
  SEED_VER: 'jewelry-shop-v1',

  _ls(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  },

  _save(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  },

  /* ---- заготовка для удалённого режима (Vercel + Turso) ---- */
  async _remote(path, method = 'GET', body) {
    const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
    const res = await fetch(this.baseUrl + path, {
      method,
      credentials: 'include',
      headers: isForm ? undefined : body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
    });
    if (!res.ok) {
      let err = 'API ' + res.status;
      try {
        const j = await res.json();
        if (j.error) err = j.error;
      } catch (_) { /* ignore */ }
      throw new Error(err);
    }
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) return res.json();
    return res.text();
  },

  /* ------------------------ инициализация ------------------- */
  async init() {
    if (this.mode === 'remote') {
      if (typeof ThemeApply !== 'undefined') {
        ThemeApply.run(await this.getSettings());
      }
      if (typeof applyI18n === 'function') applyI18n();
      if (typeof ThemeApply !== 'undefined' && ThemeApply.decorate) ThemeApply.decorate();
      return this;
    }
    const ver = localStorage.getItem(this.KEYS.seed);
    if (ver !== this.SEED_VER) {
      /* обновляем демо-каталог украшений, заказы не трогаем */
      this._save(this.KEYS.categories, Seed.categories());
      this._save(this.KEYS.products, Seed.products());
      this._save(this.KEYS.settings, Seed.settings());
      localStorage.setItem(this.KEYS.seed, this.SEED_VER);
    }
    if (!localStorage.getItem(this.KEYS.categories)) this._save(this.KEYS.categories, Seed.categories());
    if (!localStorage.getItem(this.KEYS.products)) this._save(this.KEYS.products, Seed.products());
    if (!localStorage.getItem(this.KEYS.settings)) this._save(this.KEYS.settings, Seed.settings());
    if (!localStorage.getItem(this.KEYS.orders)) this._save(this.KEYS.orders, []);
    if (!localStorage.getItem(this.KEYS.reviews)) this._save(this.KEYS.reviews, []);
    if (typeof ThemeApply !== 'undefined') {
      ThemeApply.run(await this.getSettings());
    }
    if (typeof applyI18n === 'function') applyI18n();
    if (typeof ThemeApply !== 'undefined' && ThemeApply.decorate) ThemeApply.decorate();
    return this;
  },

  /* --------------------------- товары ----------------------- */
  async getProducts() {
    if (this.mode === 'remote') {
      return this._cacheGet('products', () => this._remote('/api/products'));
    }
    return this._ls(this.KEYS.products, []);
  },
  async getProduct(id) {
    if (this.mode === 'remote') {
      try {
        return await this._remote('/api/products/' + encodeURIComponent(id));
      } catch (_) {
        const all = await this.getProducts();
        return all.find((p) => p.id === id) || null;
      }
    }
    const all = await this.getProducts();
    return all.find((p) => p.id === id) || null;
  },
  async createProduct(data) {
    if (this.mode === 'remote') {
      const product = await this._remote('/api/products', 'POST', data);
      this.invalidateCache(['products']);
      return product;
    }
    const all = this._ls(this.KEYS.products, []);
    const product = Object.assign(
      { id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), createdAt: Date.now() },
      data
    );
    all.push(product);
    this._save(this.KEYS.products, all);
    return product;
  },
  async updateProduct(id, patch) {
    if (this.mode === 'remote') {
      const product = await this._remote('/api/products/' + id, 'PATCH', patch);
      this.invalidateCache(['products']);
      return product;
    }
    const all = this._ls(this.KEYS.products, []);
    const idx = all.findIndex((p) => p.id === id);
    if (idx === -1) throw new Error('not found');
    all[idx] = Object.assign({}, all[idx], patch);
    this._save(this.KEYS.products, all);
    return all[idx];
  },
  async deleteProduct(id) {
    if (this.mode === 'remote') {
      const ok = await this._remote('/api/products/' + id, 'DELETE');
      this.invalidateCache(['products']);
      return ok;
    }
    const all = this._ls(this.KEYS.products, []).filter((p) => p.id !== id);
    this._save(this.KEYS.products, all);
    return true;
  },

  /* ------------------------- категории ----------------------- */
  async getCategories() {
    if (this.mode === 'remote') {
      return this._cacheGet('categories', () => this._remote('/api/categories'));
    }
    return this._ls(this.KEYS.categories, []);
  },
  async createCategory(data) {
    if (this.mode === 'remote') {
      const cat = await this._remote('/api/categories', 'POST', data);
      this.invalidateCache(['categories']);
      return cat;
    }
    const all = this._ls(this.KEYS.categories, []);
    const cat = Object.assign(
      { id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5) },
      data
    );
    all.push(cat);
    this._save(this.KEYS.categories, all);
    return cat;
  },
  async updateCategory(id, patch) {
    if (this.mode === 'remote') {
      const cat = await this._remote('/api/categories/' + id, 'PATCH', patch);
      this.invalidateCache(['categories']);
      return cat;
    }
    const all = this._ls(this.KEYS.categories, []);
    const idx = all.findIndex((c) => c.id === id);
    if (idx === -1) throw new Error('not found');
    all[idx] = Object.assign({}, all[idx], patch);
    this._save(this.KEYS.categories, all);
    return all[idx];
  },
  async deleteCategory(id) {
    if (this.mode === 'remote') {
      const ok = await this._remote('/api/categories/' + id, 'DELETE');
      this.invalidateCache(['categories']);
      return ok;
    }
    this._save(this.KEYS.categories, this._ls(this.KEYS.categories, []).filter((c) => c.id !== id));
    return true;
  },

  /* -------------------------- настройки ---------------------- */
  async getSettings() {
    if (this.mode === 'remote') {
      return this._cacheGet('settings', () => this._remote('/api/settings'));
    }
    const seed = Seed.settings();
    const s = this._ls(this.KEYS.settings, seed);
    return Object.assign({}, seed, s, {
      currency: 'UZS',
      usdRate: Number(s.usdRate) > 0 ? Number(s.usdRate) : 12500,
      yandexMapsKey: s.yandexMapsKey || '',
      cardNumber: s.cardNumber || seed.cardNumber,
      cardRecipient: s.cardRecipient || seed.cardRecipient,
      cardRequisites: s.cardRequisites || seed.cardRequisites,
      pickupPoints: Array.isArray(s.pickupPoints) ? s.pickupPoints : seed.pickupPoints,
      promos: Array.isArray(s.promos) && s.promos.length ? s.promos : seed.promos,
      appearance: Object.assign({}, seed.appearance, s.appearance || {}, {
        colors: Object.assign({}, seed.appearance.colors, (s.appearance && s.appearance.colors) || {}),
      }),
      uiTexts: Object.keys(seed.uiTexts).reduce((acc, key) => {
        acc[key] = Object.assign({}, seed.uiTexts[key], (s.uiTexts && s.uiTexts[key]) || {});
        return acc;
      }, Object.assign({}, s.uiTexts || {})),
      uiIcons: Object.assign({}, seed.uiIcons, s.uiIcons || {}),
    });
  },
  async saveSettings(s) {
    if (this.mode === 'remote') {
      const saved = await this._remote('/api/settings', 'PUT', s);
      this.invalidateCache(['settings']);
      return saved;
    }
    this._save(this.KEYS.settings, s);
    return s;
  },

  /* --------------------------- заказы ------------------------ */
  async getOrders() {
    if (this.mode === 'remote') return this._remote('/api/orders');
    return this._ls(this.KEYS.orders, []);
  },
  async getOrder(id) {
    if (this.mode === 'remote') return this._remote('/api/orders/' + encodeURIComponent(id));
    const all = await this.getOrders();
    return all.find((o) => o.id === id) || null;
  },
  async createOrder(data) {
    if (this.mode === 'remote') {
      const me = await this.getMe();
      const payload = Object.assign({}, data);
      if (me && me.role === 'customer') {
        payload.customerId = me.id;
        if (payload.customer) {
          payload.customer = Object.assign({}, payload.customer, {
            name: payload.customer.name || me.name,
            phone: payload.customer.phone || me.phone,
          });
        }
      }
      return this._remote('/api/orders', 'POST', payload);
    }
    const all = this._ls(this.KEYS.orders, []);
    const me = await this.getMe();
    const order = Object.assign(
      {
        id: 'o' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        number: String(100000 + Math.floor(Math.random() * 900000)),
        createdAt: Date.now(),
        status: 'new',
        customerId: me && me.role === 'customer' ? me.id : data.customerId,
      },
      data
    );
    if (!order.number) order.number = String(100000 + Math.floor(Math.random() * 900000));
    all.unshift(order);
    this._save(this.KEYS.orders, all);
    return order;
  },
  async updateOrder(id, patch) {
    if (this.mode === 'remote') return this._remote('/api/orders/' + id, 'PATCH', patch);
    const all = this._ls(this.KEYS.orders, []);
    const idx = all.findIndex((o) => o.id === id);
    if (idx === -1) throw new Error('not found');
    all[idx] = Object.assign({}, all[idx], patch);
    this._save(this.KEYS.orders, all);
    return all[idx];
  },
  async deleteOrder(id) {
    if (this.mode === 'remote') return this._remote('/api/orders/' + encodeURIComponent(id), 'DELETE');
    const all = this._ls(this.KEYS.orders, []);
    const next = all.filter((o) => o.id !== id);
    if (next.length === all.length) throw new Error('not found');
    this._save(this.KEYS.orders, next);
    return { ok: true, id };
  },

  /* --------------------------- отзывы ------------------------ */
  _normPhone(phone) {
    return String(phone || '').replace(/\D/g, '').slice(-9);
  },
  _orderHasProduct(order, productId) {
    return !!(order && Array.isArray(order.items) && order.items.some((i) => i.productId === productId));
  },
  async getReviews(productId) {
    if (this.mode === 'remote') {
      if (productId) {
        return this._remote('/api/reviews?productId=' + encodeURIComponent(productId));
      }
      return this._cacheGet('reviews', () => this._remote('/api/reviews'));
    }
    const all = this._ls(this.KEYS.reviews, []);
    if (!productId) return all;
    return all.filter((r) => r.productId === productId);
  },
  async getRatingsMap() {
    const all = await this.getReviews();
    const list = Array.isArray(all) ? all : [];
    const map = {};
    list.forEach((r) => {
      const id = r.productId;
      if (!id) return;
      if (!map[id]) map[id] = { sum: 0, count: 0, avg: 0 };
      const n = Math.max(1, Math.min(5, Number(r.rating) || 0));
      map[id].sum += n;
      map[id].count += 1;
    });
    Object.keys(map).forEach((id) => {
      map[id].avg = map[id].count ? map[id].sum / map[id].count : 0;
    });
    return map;
  },
  async createReview(data) {
    if (this.mode === 'remote') {
      const review = await this._remote('/api/reviews', 'POST', data);
      this.invalidateCache(['reviews']);
      return review;
    }
    const productId = String((data && data.productId) || '').trim();
    const orderId = String((data && data.orderId) || '').replace(/^#/, '').trim();
    const phone = this._normPhone(data && data.phone);
    const rating = Math.round(Number(data && data.rating) || 0);
    const text = String((data && data.text) || '').trim();
    if (!productId) return { ok: false, error: 'no_product' };
    if (!orderId) return { ok: false, error: 'no_order' };
    if (phone.length < 9) return { ok: false, error: 'no_phone' };
    if (rating < 1 || rating > 5) return { ok: false, error: 'no_rating' };

    const order = await this.getOrder(orderId);
    if (!order) return { ok: false, error: 'order_not_found' };
    if (order.status === 'cancelled') return { ok: false, error: 'order_cancelled' };
    if (order.type === 'custom' || !this._orderHasProduct(order, productId)) {
      return { ok: false, error: 'not_in_order' };
    }
    const orderPhone = this._normPhone(order.customer && order.customer.phone);
    if (!orderPhone || orderPhone !== phone) return { ok: false, error: 'phone_mismatch' };

    const all = this._ls(this.KEYS.reviews, []);
    const already = all.some(
      (r) =>
        r.productId === productId &&
        (r.orderId === orderId || this._normPhone(r.phone) === phone)
    );
    if (already) return { ok: false, error: 'already_reviewed' };

    const review = {
      id: 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      productId,
      orderId,
      phone,
      author: String((order.customer && order.customer.name) || '').trim(),
      rating,
      text,
      createdAt: Date.now(),
    };
    all.unshift(review);
    this._save(this.KEYS.reviews, all);
    return { ok: true, review };
  },

  /* --------------------- авторизация (заглушки, рабочие будут в конце) ----- */
  async login(email, password) {
    if (this.mode === 'remote') {
      try {
        return await this._remote('/api/auth/login', 'POST', { email, password, phone: email });
      } catch (e) {
        return { ok: false, error: e.message };
      }
    }
    const s = await this.getSettings();
    if (email === 'admin' && password === s.adminPassword) {
      const user = { id: 'admin', name: 'Администратор', role: 'admin' };
      this._save(this.KEYS.session, user);
      return { ok: true, user };
    }
    return { ok: false, error: 'bad_credentials' };
  },
  async register(data) {
    if (this.mode === 'remote') {
      try {
        return await this._remote('/api/auth/register', 'POST', data);
      } catch (e) {
        return { ok: false, error: e.message };
      }
    }
    const user = Object.assign({ id: 'u' + Date.now().toString(36), role: 'customer' }, data);
    this._save(this.KEYS.session, user);
    return { ok: true, user };
  },
  async logout() {
    if (this.mode === 'remote') return this._remote('/api/auth/logout', 'POST');
    localStorage.removeItem(this.KEYS.session);
    return { ok: true };
  },
  async getMe() {
    if (this.mode === 'remote') {
      try {
        return await this._remote('/api/auth/me');
      } catch (_) {
        return null;
      }
    }
    return this._ls(this.KEYS.session, null);
  },

  async updateProfile(patch) {
    if (this.mode === 'remote') {
      try {
        return await this._remote('/api/auth/profile', 'PUT', patch);
      } catch (e) {
        // Some hosts reject PUT — fall back to POST
        if (String(e.message || '').includes('405') || String(e.message || '').includes('method')) {
          return this._remote('/api/auth/profile', 'POST', patch);
        }
        throw e;
      }
    }
    const me = this._ls(this.KEYS.session, null);
    if (!me || me.role !== 'customer') throw new Error('auth');
    const next = Object.assign({}, me, patch);
    this._save(this.KEYS.session, next);
    return { ok: true, user: next };
  },

  async getMyOrders() {
    if (this.mode === 'remote') return this._remote('/api/orders');
    const me = await this.getMe();
    if (!me || me.role !== 'customer') return [];
    const all = await this.getOrders();
    const phone = this._normPhone(me.phone);
    return all.filter(
      (o) => o.customerId === me.id || this._normPhone(o.customer && o.customer.phone) === phone
    );
  },

  async uploadMedia(dataUrl, mime) {
    if (this.mode === 'remote') {
      return this._remote('/api/media', 'POST', { data: dataUrl, mime: mime || 'application/octet-stream' });
    }
    return { ok: true, url: dataUrl, id: 'local' };
  },

  async getChatThread(since) {
    const q = since ? '?since=' + encodeURIComponent(since) : '';
    if (this.mode === 'remote') return this._remote('/api/chat/thread' + q);
    return { thread: null, messages: [] };
  },

  async sendChatMessage(payload) {
    if (this.mode === 'remote') return this._remote('/api/chat/messages', 'POST', payload);
    return { ok: false, error: 'local' };
  },

  /* --------------------- экспорт / импорт бэкапа ------------- */
  async exportBackup() {
    return {
      products: await this.getProducts(),
      categories: await this.getCategories(),
      settings: await this.getSettings(),
      orders: await this.getOrders(),
      reviews: await this.getReviews(),
      exportedAt: new Date().toISOString(),
    };
  },
  async importBackup(data) {
    if (this.mode === 'remote') {
      return this._remote('/api/backup', 'PUT', data);
    }
    if (data.products) this._save(this.KEYS.products, data.products);
    if (data.categories) this._save(this.KEYS.categories, data.categories);
    if (data.settings) this._save(this.KEYS.settings, data.settings);
    if (data.orders) this._save(this.KEYS.orders, data.orders);
    if (data.reviews) this._save(this.KEYS.reviews, data.reviews);
    return true;
  },
};

/* ============================================================
   Seed — handmade jewelry
   ============================================================ */
const Seed = (() => {
  function svg(core, w = 600, h = 600) {
    const markup =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">` +
      `<defs><radialGradient id="bg" cx="50%" cy="60%" r="70%"><stop offset="0%" stop-color="#faf6ea"/><stop offset="100%" stop-color="#e9dfc6"/></radialGradient></defs>` +
      `<rect width="${w}" height="${h}" rx="40" fill="url(#bg)"/>` +
      `<circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) * 0.42}" fill="#f1ead6" opacity="0.9"/>` +
      core +
      `</svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(markup);
  }

  const IMG = {
    jewelry: svg(`<g transform="translate(300,300)"><circle cx="0" cy="-20" r="70" fill="none" stroke="#c9b88a" stroke-width="10"/><path d="M0 40 L-28 90 L0 74 L28 90 Z" fill="#e8a18b"/><circle cx="0" cy="40" r="14" fill="#7d936a"/><circle cx="0" cy="-20" r="18" fill="#f6c453"/></g>`),
    keychain: svg(`<g transform="translate(300,300)"><circle cx="0" cy="-60" r="28" fill="none" stroke="#c9b88a" stroke-width="10"/><rect x="-8" y="-30" width="16" height="40" rx="4" fill="#7d936a"/><circle cx="0" cy="50" r="55" fill="#f3ead6" stroke="#e8a18b" stroke-width="6"/><circle cx="-14" cy="42" r="6" fill="#2c2c2c"/><circle cx="14" cy="42" r="6" fill="#2c2c2c"/><path d="M-10 62 Q0 72 10 62" fill="none" stroke="#2c2c2c" stroke-width="4"/></g>`),
    pinBadge: svg(`<g transform="translate(300,300)"><circle cx="0" cy="0" r="90" fill="#e8a18b"/><circle cx="0" cy="0" r="68" fill="#f8f3e6"/><path d="M-20 -10 Q0 -40 20 -10 Q0 10 -20 -10" fill="#7d936a"/></g>`),
    choker: svg(`<g transform="translate(300,300)"><ellipse cx="0" cy="-10" rx="130" ry="70" fill="none" stroke="#5c6f4a" stroke-width="18"/><circle cx="0" cy="62" r="22" fill="#e8a18b"/><circle cx="0" cy="62" r="10" fill="#f6c453"/></g>`),
    bracelet: svg(`<g transform="translate(300,300)"><ellipse cx="0" cy="0" rx="110" ry="70" fill="none" stroke="#c9b88a" stroke-width="16"/><circle cx="-90" cy="0" r="16" fill="#7d936a"/><circle cx="-50" cy="-48" r="14" fill="#e8a18b"/><circle cx="10" cy="-62" r="14" fill="#f6c453"/><circle cx="70" cy="-40" r="14" fill="#7d936a"/><circle cx="100" cy="8" r="14" fill="#e8a18b"/></g>`),
    phoneCharm: svg(`<g transform="translate(300,280)"><rect x="-18" y="-130" width="36" height="70" rx="8" fill="#c9b88a"/><rect x="-8" y="-60" width="16" height="50" rx="4" fill="#7d936a"/><circle cx="0" cy="40" r="58" fill="#f3ead6" stroke="#e8a18b" stroke-width="7"/><path d="M-16 28 Q0 8 16 28 Q0 52 -16 28" fill="#7d936a"/></g>`),
  };

  function tri(ru, uz, en) {
    return { ru, uz, en };
  }

  function categories() {
    return [
      { id: 'keychains', icon: '🔑', name: tri('Брелки', 'Breloklar', 'Keychains') },
      { id: 'pendants', icon: '💎', name: tri('Кулоны', 'Kulonlar', 'Pendants') },
      { id: 'chokers', icon: '✨', name: tri('Чокеры', 'Chokerlar', 'Chokers') },
      { id: 'bracelets', icon: '📿', name: tri('Браслеты', 'Brasletlar', 'Bracelets') },
      { id: 'phone-charms', icon: '📱', name: tri('Подвески для телефона', 'Telefon osmalari', 'Phone charms') },
    ];
  }

  function products() {
    const now = Date.now();
    return [
      {
        id: 'p-keychain-smile', categoryId: 'keychains', featured: true, inStock: true, createdAt: now,
        price: 45000, oldPrice: null, tags: ['keychain', 'handmade'], images: [IMG.keychain],
        title: tri('Брелок Smile', 'Smile brelok', 'Smile Keychain'),
        desc: tri('Милый брелок ручной работы.', "Qo'lda yasalgan brelok.", 'Cute handmade keychain.'),
      },
      {
        id: 'p-keychain-heart', categoryId: 'keychains', featured: true, inStock: true, createdAt: now,
        price: 52000, oldPrice: 60000, tags: ['keychain', 'heart'], images: [IMG.pinBadge],
        title: tri('Брелок-сердечко', 'Yurak brelok', 'Heart Keychain'),
        desc: tri('Компактный брелок с сердечком.', 'Yurakcha bilan brelok.', 'Compact heart keychain.'),
      },
      {
        id: 'p-pendant-crystal', categoryId: 'pendants', featured: true, inStock: true, createdAt: now,
        price: 150000, oldPrice: null, tags: ['pendant', 'necklace'], images: [IMG.jewelry],
        title: tri('Кулон Crystal', 'Crystal kulon', 'Crystal Pendant'),
        desc: tri('Нежный кулон ручной работы.', "Qo'lda yasalgan nozik kulon.", 'Delicate handmade pendant.'),
      },
      {
        id: 'p-pendant-charm', categoryId: 'pendants', featured: true, inStock: true, createdAt: now,
        price: 135000, oldPrice: null, tags: ['pendant', 'charm'], images: [IMG.jewelry],
        title: tri('Кулон Charm', 'Charm kulon', 'Charm Pendant'),
        desc: tri('Кулон для повседневного образа и подарка.', 'Kundalik va sovg‘a uchun kulon.', 'Everyday charm pendant.'),
      },
      {
        id: 'p-choker-sage', categoryId: 'chokers', featured: true, inStock: true, createdAt: now,
        price: 110000, oldPrice: null, tags: ['choker'], images: [IMG.choker],
        title: tri('Чокер Sage', 'Sage choker', 'Sage Choker'),
        desc: tri('Чокер ручной работы с подвеской.', "Osma bilan qo'lda yasalgan choker.", 'Handmade choker with a charm.'),
      },
      {
        id: 'p-bracelet-beads', categoryId: 'bracelets', featured: true, inStock: true, createdAt: now,
        price: 89000, oldPrice: null, tags: ['bracelet', 'beads'], images: [IMG.bracelet],
        title: tri('Браслет из бусин', 'Munchoqli braslet', 'Beaded Bracelet'),
        desc: tri('Браслет из бусин ручной сборки.', "Qo'lda yig'ilgan munchoqli braslet.", 'Hand-assembled beaded bracelet.'),
      },
      {
        id: 'p-phone-charm', categoryId: 'phone-charms', featured: true, inStock: true, createdAt: now,
        price: 38000, oldPrice: null, tags: ['phone', 'charm'], images: [IMG.phoneCharm],
        title: tri('Подвеска для телефона', 'Telefon osmagi', 'Phone Charm'),
        desc: tri('Лёгкая подвеска на телефон.', 'Telefon uchun yengil osma.', 'Light phone charm.'),
      },
      {
        id: 'p-bracelet-soft', categoryId: 'bracelets', featured: false, inStock: true, createdAt: now,
        price: 98000, oldPrice: 115000, tags: ['bracelet'], images: [IMG.bracelet],
        title: tri('Браслет Soft', 'Soft braslet', 'Soft Bracelet'),
        desc: tri('Мягкий браслет в пастельных тонах.', 'Pastel ohangdagi yumshoq braslet.', 'Soft pastel bracelet.'),
      },
    ];
  }

  function settings() {
    return {
      siteName: 'YouCanSmile',
      currency: 'UZS',
      usdRate: 12500,
      yandexMapsKey: '',
      cardNumber: '8600123456781234',
      cardRecipient: 'Mirsagatova Madina',
      cardRequisites: {
        ru: 'Перевод на карту: 8600 **** **** 1234, получатель Mirsagatova Madina. Любой комментарий. Оплатите в течение 10 минут и пришлите чек.',
        uz: "Kartaga o'tkazma: 8600 **** **** 1234, oluvchi Mirsagatova Madina. Istalgan izoh. 10 daqiqa ichida to'lang va chek yuboring.",
        en: 'Card transfer: 8600 **** **** 1234, recipient Mirsagatova Madina. Any comment. Pay within 10 minutes and send the receipt.',
      },
      pickupPoints: [
        { id: 'chorsu', name: tri('Чорсу', 'Chorsu', 'Chorsu'), coords: [41.3265, 69.235], address: tri('Ташкент, Чорсу', 'Toshkent, Chorsu', 'Tashkent, Chorsu') },
        { id: 'next', name: tri('Next / Бобура', 'Next / Bobur', 'Next / Bobur'), coords: [41.2997, 69.2494], address: tri('Ташкент, ул. Бобура', 'Toshkent, Bobur', 'Tashkent, Bobur st.') },
      ],
      announcement: {
        ru: 'Брелки · кулоны · чокеры · браслеты · подвески для телефона · индивидуальный заказ',
        uz: 'Breloklar · kulonlar · chokerlar · brasletlar · telefon osmalari · individual buyurtma',
        en: 'Keychains · pendants · chokers · bracelets · phone charms · custom order',
      },
      promos: [
        {
          id: 'promo-sale',
          tone: 'coral',
          badge: { ru: 'Акция', uz: 'Aksiya', en: 'Sale' },
          title: { ru: '−15% на украшения недели', uz: "Hafta taqinchoqlariga −15%", en: '−15% on jewelry this week' },
          text: {
            ru: 'Кулоны, чокеры и браслеты ручной работы — успейте до воскресенья.',
            uz: "Qo'lda yasalgan kulon, choker va brasletlar — yakshanbagacha.",
            en: 'Handmade pendants, chokers and bracelets — until Sunday.',
          },
          cta: { ru: 'К украшениям', uz: 'Taqinchoqlarga', en: 'Shop jewelry' },
          href: 'catalog.html',
        },
        {
          id: 'promo-new',
          tone: 'sage',
          badge: { ru: 'Новинка', uz: 'Yangilik', en: 'New' },
          title: { ru: 'Новые брелки и подвески', uz: 'Yangi brelok va osmalar', en: 'New keychains & charms' },
          text: {
            ru: 'Брелки и подвески для телефона — маленькие детали, которые радуют каждый день.',
            uz: 'Breloklar va telefon osmalari — har kuni quvontiradigan kichik detallar.',
            en: 'Keychains and phone charms — little details that brighten the day.',
          },
          cta: { ru: 'Смотреть брелки', uz: "Breloklarni ko'rish", en: 'Browse keychains' },
          href: 'catalog.html?cat=keychains',
        },
        {
          id: 'promo-custom',
          tone: 'cream',
          badge: { ru: 'Индивидуально', uz: 'Individual', en: 'Custom' },
          title: { ru: 'Украшение по вашему желанию', uz: "O'zingiz xohlagan taqinchoq", en: 'Jewelry made for you' },
          text: {
            ru: 'Опишите идею — например брелок по персонажу. Сделаем кулон, чокер или подвеску под вас.',
            uz: "G'oyangizni yozing — masalan personaj breloki. Kulon, choker yoki osma tayyorlaymiz.",
            en: 'Describe your idea — a character keychain, pendant, choker or phone charm made for you.',
          },
          cta: { ru: 'Оформить заявку', uz: "So'rov yuborish", en: 'Start custom order' },
          href: 'custom-order.html',
        },
      ],
      heroTitle: { ru: 'YouCanSmile', uz: 'YouCanSmile', en: 'YouCanSmile' },
      heroSubtitle: {
        ru: 'Украшения ручной работы: брелки, кулоны, чокеры, браслеты и подвески для телефона.',
        uz: "Qo'lda yasalgan taqinchoqlar: brelok, kulon, choker, braslet va telefon osmalari.",
        en: 'Handmade jewelry: keychains, pendants, chokers, bracelets and phone charms.',
      },
      about: {
        ru: 'YouCanSmile — украшения ручной работы. Брелки, кулоны, чокеры, браслеты и подвески для телефона. Индивидуальный заказ — по вашей идее.',
        uz: "YouCanSmile — qo'lda yasalgan taqinchoqlar. Brelok, kulon, choker, braslet va telefon osmalari. Individual buyurtma — sizning g'oyangiz bo'yicha.",
        en: 'YouCanSmile — handmade jewelry. Keychains, pendants, chokers, bracelets and phone charms. Custom pieces made to your idea.',
      },
      footerAbout: {
        ru: 'YouCanSmile — handmade-украшения: брелки, кулоны, чокеры, браслеты и подвески для телефона.',
        uz: "YouCanSmile — handmade taqinchoqlar: brelok, kulon, choker, braslet va telefon osmalari.",
        en: 'YouCanSmile — handmade jewelry: keychains, pendants, chokers, bracelets and phone charms.',
      },
      contacts: {
        telegram: 'https://t.me/youcansmile',
        whatsapp: 'https://wa.me/998901234567',
        email: 'hello@youcansmile.ru',
        instagram: 'https://instagram.com/youcansmile',
      },
      social: { telegram: 'https://t.me/youcansmile', instagram: 'https://instagram.com/youcansmile', whatsapp: 'https://wa.me/998901234567' },
      orderContact: 'https://t.me/youcansmile',
      adminPassword: 'admin123',
      appearance: {
        wallpaper: '',
        colors: {
          accent: '',
          accentDark: '',
          primaryText: '',
          secondaryBg: '',
          secondaryBorder: '',
          secondaryText: '',
          headerBg: '',
          pageBg: '',
        },
      },
      uiTexts: {
        sage_hero_cta: { ru: '', uz: '', en: '' },
        sage_hero_custom: { ru: '', uz: '', en: '' },
        product_add_bag: { ru: '', uz: '', en: '' },
        product_checkout_now: { ru: '', uz: '', en: '' },
        cart_checkout: { ru: '', uz: '', en: '' },
        order_btn: { ru: '', uz: '', en: '' },
        custom_submit: { ru: '', uz: '', en: '' },
      },
      uiIcons: {
        cart: '',
        fav: '',
        search: '',
        customOrder: '',
      },
    };
  }

  return { categories, products, settings, IMG };
})();
