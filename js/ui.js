/* ============================================================
   YouCanSmile — UI: header, footer, cards, toasts
   ============================================================ */
const UI = (() => {
  let settings = null;

  async function getSettings() {
    if (!settings) settings = await Api.getSettings();
    return settings;
  }

  function toast(msg) {
    let box = document.querySelector('.toast-box');
    if (!box) {
      box = document.createElement('div');
      box.className = 'toast-box';
      document.body.appendChild(box);
    }
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    box.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 400);
    }, 2400);
  }

  function formatCardNumber(num) {
    return String(num || '')
      .replace(/\D/g, '')
      .replace(/(\d{4})(?=\d)/g, '$1 ')
      .trim();
  }

  function payRequisitesHTML(s) {
    const number = s.cardNumber || '8600123456781234';
    const recipient = s.cardRecipient || 'Mirsagatova Madina';
    const pretty = formatCardNumber(number);
    return `
      <b data-i18n="pay_requisites">${I18n.t('pay_requisites')}</b>
      <div class="pay-card-row">
        <span class="pay-card-number" id="payCardNumber">${escapeHtml(pretty)}</span>
        <button type="button" class="btn btn-sm btn-secondary js-copy-card" data-card="${escapeHtml(number)}">${I18n.t('pay_copy')}</button>
      </div>
      <p class="pay-recipient">${I18n.t('pay_recipient')}: <b>${escapeHtml(recipient)}</b></p>
      <p class="pay-note">${I18n.t('pay_deadline_note')}</p>
      <label class="pay-receipt-label">
        <input type="file" accept="image/*" class="js-receipt-input"/>
        <span class="pay-receipt-btn">${I18n.t('pay_attach_receipt')}</span>
        <span class="pay-receipt-name" data-empty="1">${I18n.t('pay_receipt_none')}</span>
      </label>`;
  }

  function bindPayRequisites(root) {
    if (!root) return;
    root.querySelectorAll('.js-copy-card').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const raw = btn.dataset.card || '';
        try {
          await navigator.clipboard.writeText(raw);
          toast(I18n.t('pay_copied'));
        } catch (e) {
          toast(raw);
        }
      });
    });
    root.querySelectorAll('.js-receipt-input').forEach((input) => {
      input.addEventListener('change', () => {
        const nameEl = input.closest('.pay-receipt-label')?.querySelector('.pay-receipt-name');
        const file = input.files && input.files[0];
        if (nameEl) {
          nameEl.textContent = file ? file.name : I18n.t('pay_receipt_none');
          nameEl.dataset.empty = file ? '0' : '1';
        }
      });
    });
  }

  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      if (!file) return resolve('');
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('read-failed'));
      reader.readAsDataURL(file);
    });
  }

  async function getReceiptDataURL(root) {
    const input = (root || document).querySelector('.js-receipt-input');
    if (!input || !input.files || !input.files[0]) return '';
    return readFileAsDataURL(input.files[0]);
  }

  async function renderHeader(active = '') {
    const s = await getSettings();
    const root = document.getElementById('header-root');
    if (!root) return;

    const theme = (document.documentElement.getAttribute('data-theme') || 'sage').toLowerCase();
    const isPurple = theme === 'purple';
    const isActive = (p) => (active === p ? ' class="active"' : '');
    const cur = Store.getDisplayCurrency();
    const settingsPanel = `
            <div class="header-settings">
              <button class="icon-btn" id="settingsToggle" aria-label="${I18n.t('settings_title')}" title="${I18n.t('settings_title')}">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V20a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H4a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V4a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c.3.6.9 1 1.5 1H20a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>
              </button>
              <div class="settings-panel" id="settingsPanel">
                <div>
                  <div class="sp-label">${I18n.t('settings_theme')}</div>
                  <div class="theme-row">
                    <button type="button" class="theme-chip${isPurple ? '' : ' active'}" data-theme-set="sage">🌿 Sage</button>
                    <button type="button" class="theme-chip${isPurple ? ' active' : ''}" data-theme-set="purple">💜 Purple</button>
                  </div>
                </div>
                <div>
                  <div class="sp-label">${I18n.t('settings_lang')}</div>
                  <div class="lang-switch" role="group" aria-label="language">
                    <button class="lang-btn${I18n.lang === 'ru' ? ' active' : ''}" data-lang="ru">RU</button>
                    <button class="lang-btn${I18n.lang === 'uz' ? ' active' : ''}" data-lang="uz">UZ</button>
                    <button class="lang-btn${I18n.lang === 'en' ? ' active' : ''}" data-lang="en">EN</button>
                  </div>
                </div>
                <div>
                  <div class="sp-label">${I18n.t('settings_currency')}</div>
                  <div class="currency-switch" role="group" aria-label="currency">
                    <button class="cur-btn${cur === 'UZS' ? ' active' : ''}" data-cur="UZS">${I18n.t('currency_uzs')}</button>
                    <button class="cur-btn${cur === 'USD' ? ' active' : ''}" data-cur="USD">$</button>
                  </div>
                </div>
              </div>
            </div>`;

    const logo = isPurple
      ? `<a class="logo" href="index.html">You<span>Can</span>Smile</a>`
      : `<a class="logo logo-badge" href="index.html"><img class="logo-cat" src="img/logo-ycs.png" alt="YOU CAN SMILE SHOP"/></a>`;

    const iconMarkup = (name, svg) => {
      const emoji = (typeof ThemeApply !== 'undefined' && ThemeApply.icon(name, '')) || '';
      return emoji ? `<span class="icon-emoji" aria-hidden="true">${emoji}</span>` : svg;
    };
    const searchSvg = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg>`;
    const favSvg = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s-8-4.9-8-11a4.5 4.5 0 0 1 8-3 4.5 4.5 0 0 1 8 3c0 6.1-8 11-8 11z"/></svg>`;
    const cartSvg = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1.6"/><circle cx="19" cy="21" r="1.6"/><path d="M2 3h3l2.5 12h11L21 7H6"/></svg>`;
    const profileSvg = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/></svg>`;
    /* Receipt / order history */
    const ordersSvg = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h8l3 3v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M15 3v4h4"/><path d="M9 12h6M9 16h4"/></svg>`;

    const nav = `
            <a href="catalog.html"${isActive('catalog')} data-i18n="sage_nav_shop">${I18n.t('sage_nav_shop')}</a>
            <a href="index.html#about" data-i18n="sage_nav_about">${I18n.t('sage_nav_about')}</a>
            <a class="nav-mobile-only" href="favorites.html"${isActive('favorites')} data-i18n="nav_favorites">${I18n.t('nav_favorites')}</a>
            <a class="nav-mobile-only" href="orders.html"${isActive('orders')} data-i18n="account_orders">${I18n.t('account_orders')}</a>
            <a class="nav-mobile-only" href="account.html"${isActive('account')} data-i18n="nav_account">${I18n.t('nav_account')}</a>`;

    root.innerHTML = `
      <header class="header">
        <div class="container header-inner">
          <button class="burger" id="burger" aria-label="menu">
            <span></span><span></span><span></span>
          </button>
          ${logo}
          <nav class="nav" id="nav">${nav}</nav>
          <div class="header-actions">
            <div class="header-group header-group-tools">
              <button class="icon-btn search-toggle" id="searchToggle" aria-label="search" title="${I18n.t('search_placeholder')}">
                ${iconMarkup('search', searchSvg)}
              </button>
            </div>
            <div class="header-group header-group-shop">
              <a class="icon-btn fav-btn header-bar-extra" href="favorites.html" aria-label="${I18n.t('nav_favorites')}" title="${I18n.t('nav_favorites')}">
                ${iconMarkup('fav', favSvg)}
                <span class="badge fav-badge hidden">0</span>
              </a>
              <a class="icon-btn orders-btn header-bar-extra" href="orders.html" aria-label="${I18n.t('account_orders')}" title="${I18n.t('account_orders')}">
                ${ordersSvg}
              </a>
              <a class="icon-btn cart-btn" href="cart.html" aria-label="${I18n.t('nav_cart')}" title="${I18n.t('nav_cart')}">
                ${iconMarkup('cart', cartSvg)}
                <span class="badge cart-badge hidden">0</span>
              </a>
            </div>
            <div class="header-group header-group-user">
              <a class="icon-btn account-btn header-bar-extra" href="account.html" aria-label="${I18n.t('nav_account')}" title="${I18n.t('nav_account')}">
                ${profileSvg}
              </a>
              ${settingsPanel}
            </div>
          </div>
        </div>
        <div class="search-bar" id="searchBar">
          <div class="container">
            <input type="text" id="searchInput" placeholder="${I18n.t('search_placeholder')}" autocomplete="off"/>
          </div>
          <div class="search-results container" id="searchResults"></div>
        </div>
      </header>`;

    syncCounts();

    const burger = document.getElementById('burger');
    const navEl = document.getElementById('nav');
    burger.addEventListener('click', () => {
      navEl.classList.toggle('open');
      burger.classList.toggle('open');
    });

    const settingsToggle = document.getElementById('settingsToggle');
    const settingsPanelEl = document.getElementById('settingsPanel');
    if (settingsToggle && settingsPanelEl) {
      settingsToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        settingsPanelEl.classList.toggle('open');
      });
      document.addEventListener('click', (e) => {
        if (!e.target.closest('.header-settings')) settingsPanelEl.classList.remove('open');
      });
    }

    root.querySelectorAll('[data-theme-set]').forEach((b) =>
      b.addEventListener('click', () => {
        try {
          localStorage.setItem('ycs_theme', b.dataset.themeSet);
        } catch (e) {}
        location.reload();
      })
    );

    root.querySelectorAll('.lang-btn').forEach((b) =>
      b.addEventListener('click', () => {
        I18n.setLang(b.dataset.lang);
        location.reload();
      })
    );
    root.querySelectorAll('.cur-btn').forEach((b) =>
      b.addEventListener('click', () => {
        Store.setDisplayCurrency(b.dataset.cur);
        location.reload();
      })
    );

    const toggle = document.getElementById('searchToggle');
    const bar = document.getElementById('searchBar');
    toggle.addEventListener('click', () => {
      bar.classList.toggle('open');
      if (bar.classList.contains('open')) document.getElementById('searchInput').focus();
    });
    const input = document.getElementById('searchInput');
    let searchTimer = null;
    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      const box = document.getElementById('searchResults');
      if (q.length < 2) {
        box.innerHTML = '';
        box.classList.remove('show');
        return;
      }
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        Api.getProducts().then((products) => {
          const hits = products.filter(
            (p) =>
              (p.title.ru || '').toLowerCase().includes(q) ||
              (p.title.en || '').toLowerCase().includes(q) ||
              (p.title.uz || '').toLowerCase().includes(q) ||
              (p.tags || []).join(' ').toLowerCase().includes(q)
          );
          box.innerHTML = hits.length
            ? hits
                .slice(0, 6)
                .map(
                  (p) => `
                <a class="search-hit" href="product.html?id=${p.id}">
                  <img src="${p.images[0]}" alt="" loading="lazy"/>
                  <div class="sh-info">
                    <b>${escapeHtml(I18n.txt(p.title))}</b>
                    <span>${Store.formatPrice(p.price, s)}</span>
                  </div>
                </a>`
                )
                .join('')
            : `<div class="search-hit empty">${I18n.t('search_empty')}</div>`;
          box.classList.add('show');
        });
      }, 250);
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-bar') && !e.target.closest('.search-toggle')) {
        bar.classList.remove('open');
      }
    });
  }

  async function renderFooter() {
    const s = await getSettings();
    const root = document.getElementById('footer-root');
    if (!root) return;

    const theme = (document.documentElement.getAttribute('data-theme') || 'sage').toLowerCase();
    const isPurple = theme === 'purple';
    const tg = normalizeContactHref('telegram', pickContact(s, 'telegram'));
    const ig = normalizeContactHref('instagram', pickContact(s, 'instagram'));
    const wa = normalizeContactHref('whatsapp', pickContact(s, 'whatsapp'));
    const em = pickContact(s, 'email');
    const tgChannel = normalizeContactHref('telegram', s.telegramChannel || '');
    const hasAnyContact = !!(tg || ig || wa || em);
    const socialIcons = [
      ig ? `<a href="${escapeHtml(ig)}" target="_blank" rel="noopener" aria-label="Instagram">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1"/></svg>
              </a>` : '',
      tg ? `<a href="${escapeHtml(tg)}" target="_blank" rel="noopener" aria-label="Telegram">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M21.5 4.3 3.7 11.1c-1.2.5-1.2 1.2-.2 1.5l4.6 1.4 1.8 5.4c.2.7.4.9 1 .9.5 0 .7-.2 1-.6l2.7-4.4 5.6 4.1c1 .6 1.7.3 2-.9L23 5.5c.3-1.3-.5-1.9-1.5-1.2z"/></svg>
              </a>` : '',
      wa ? `<a href="${escapeHtml(wa)}" target="_blank" rel="noopener" aria-label="WhatsApp">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 11.5a8.5 8.5 0 1 1-3.1-6.6L21 5v6.5z"/><path d="M8.5 10.5c1.5 3 3.5 4.5 5.5 5l1.5-1.5 2 1v2.5a1.5 1.5 0 0 1-1.7 1.5C10 17.5 6 13 5.5 7.7A1.5 1.5 0 0 1 7 6h2.5l1 2-2 1.5z"/></svg>
              </a>` : '',
      em ? `<a href="mailto:${escapeHtml(em)}" aria-label="Email">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 6h16v12H4z"/><path d="M4 7l8 6 8-6"/></svg>
              </a>` : '',
    ].join('');
    const brand = isPurple
      ? `<a class="logo" href="index.html">You<span>Can</span>Smile</a>`
      : `<div class="fs-brand"><img src="img/logo-ycs.png" alt="YOU CAN SMILE SHOP"/><b>YOU CAN SMILE SHOP</b></div>`;

    root.innerHTML = `
      <footer class="footer-sage${isPurple ? ' footer-purple' : ''}">
        <div class="container footer-sage-grid">
          <div class="fs-col">
            ${brand}
            <p class="fs-about">${escapeHtml(I18n.txt(s.footerAbout))}</p>
          </div>
          <div class="fs-col">
            <h4>${I18n.t('sage_footer_links')}</h4>
            <a href="catalog.html">${I18n.t('sage_nav_shop')}</a>
            <a href="index.html#faq">${I18n.t('sage_footer_faq')}</a>
            <a href="index.html#shipping">${I18n.t('sage_footer_shipping')}</a>
            ${hasAnyContact ? `<a href="index.html#contacts">${I18n.t('sage_footer_contact')}</a>` : ''}
            ${isPurple ? `<a href="admin.html">${I18n.t('nav_admin')}</a>` : ''}
          </div>
          ${(socialIcons || tgChannel) ? `<div class="fs-col">
            <h4>${I18n.t('sage_footer_follow')}</h4>
            ${socialIcons ? `<div class="fs-social">${socialIcons}</div>` : ''}
            ${tgChannel ? `<a class="fs-channel" href="${escapeHtml(tgChannel)}" target="_blank" rel="noopener">+ Youcansmile Канал</a>` : ''}
          </div>` : ''}
        </div>
        <div class="container footer-bottom">
          <span>© ${new Date().getFullYear()} YouCanSmile — ${I18n.t('footer_rights')}</span>
          <span>${I18n.t('footer_made')}</span>
        </div>
      </footer>`;
    if (typeof Chat !== 'undefined' && !/admin\.html/i.test(location.pathname)) {
      const bootChat = () => {
        try {
          Chat.init();
        } catch (_) { /* ignore */ }
      };
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(bootChat, { timeout: 2800 });
      } else {
        setTimeout(bootChat, 800);
      }
    }
  }

  function syncCounts() {
    const cartN = Store.countCart();
    const favN = Store.getFavorites().length;
    const cb = document.querySelector('.cart-badge');
    const fb = document.querySelector('.fav-badge');
    if (cb) {
      cb.textContent = cartN;
      cb.classList.toggle('hidden', cartN === 0);
      cb.classList.add('pop');
      setTimeout(() => cb.classList.remove('pop'), 350);
    }
    if (fb) {
      fb.textContent = favN;
      fb.classList.toggle('hidden', favN === 0);
    }
  }

  function ratingStars(avg, count) {
    const n = count ? Math.round(Number(avg) || 0) : 0;
    const stars = [1, 2, 3, 4, 5]
      .map((i) => `<span class="star${i <= n ? ' on' : ''}">★</span>`)
      .join('');
    const label = count
      ? `${Number(avg).toFixed(1)} · ${count}`
      : I18n.t('review_none');
    return `<div class="card-rating" aria-label="${escapeHtml(label)}">${stars} <span>${escapeHtml(label)}</span></div>`;
  }

  async function cardHTML(p, currency, ratingInfo) {
    const s = await getSettings();
    const disc = Store.discountPercent(p);
    const fav = Store.isFavorite(p.id);
    const isNew = !p.oldPrice && (p.featured || (p.createdAt && Date.now() - p.createdAt < 1000 * 60 * 60 * 24 * 60));
    const stockBadge = !p.inStock
      ? `<span class="badge-stock out">${I18n.t('product_no_stock')}</span>`
      : disc > 0
        ? `<span class="badge-stock disc">Sale −${disc}%</span>`
        : isNew
          ? `<span class="badge-stock new">New</span>`
          : '';
    const info = ratingInfo || { avg: 0, count: 0 };
    const img = (Array.isArray(p.images) && p.images[0]) || 'img/logo-ycs.png';
    return `
      <article class="card">
        <a class="card-img" href="product.html?id=${p.id}">
          ${stockBadge}
          <img src="${img}" alt="${escapeHtml(I18n.txt(p.title))}" loading="lazy"/>
        </a>
        <button class="card-fav ${fav ? 'active' : ''}" data-fav="${p.id}" aria-label="fav">
          ${
            (typeof ThemeApply !== 'undefined' && ThemeApply.icon('fav', ''))
              ? `<span class="icon-emoji">${ThemeApply.icon('fav', '')}</span>`
              : `<svg viewBox="0 0 24 24" width="18" height="18" fill="${fav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M12 21s-8-4.9-8-11a4.5 4.5 0 0 1 8-3 4.5 4.5 0 0 1 8 3c0 6.1-8 11-8 11z"/></svg>`
          }
        </button>
        <div class="card-body">
          ${ratingStars(info.avg, info.count)}
          <a class="card-title" href="product.html?id=${p.id}">${escapeHtml(I18n.txt(p.title))}</a>
          <div class="card-price">
            <b>${Store.formatPrice(p.price, s)}</b>
            ${p.oldPrice ? `<s>${Store.formatPrice(p.oldPrice, s)}</s>` : ''}
          </div>
          <div class="card-actions">
            <button class="btn btn-secondary btn-sm js-add" data-id="${p.id}" ${p.inStock ? '' : 'disabled'}>
              ${I18n.t('product_add_bag')}
            </button>
            <button class="btn btn-primary btn-sm js-buy" data-id="${p.id}" ${p.inStock ? '' : 'disabled'}>
              ${I18n.t('product_checkout_now')}
            </button>
          </div>
        </div>
      </article>`;
  }

  async function renderGrid(container, products, currency) {
    if (!container) return;
    let ratings = {};
    try {
      ratings = (typeof Api !== 'undefined' && Api.getRatingsMap) ? await Api.getRatingsMap() : {};
    } catch (_) {
      ratings = {};
    }
    const list = Array.isArray(products) ? products : [];
    container.innerHTML = list.length
      ? (await Promise.all(list.map((p) => cardHTML(p, currency, ratings[p.id])))).join('')
      : '';
    bindCardEvents(container);
  }

  function bindCardEvents(container) {
    container.addEventListener('click', async (e) => {
      const buy = e.target.closest('.js-buy');
      const add = e.target.closest('.js-add');
      const fav = e.target.closest('[data-fav]');
      if (buy) {
        Store.addToCart(buy.dataset.id, 1);
        toast(I18n.t('toast_cart_ok'));
        syncCounts();
        location.href = 'cart.html';
        return;
      }
      if (add) {
        Store.addToCart(add.dataset.id, 1);
        toast(I18n.t('toast_cart_ok'));
        syncCounts();
      }
      if (fav) {
        e.preventDefault();
        const id = fav.dataset.fav;
        const added = Store.toggleFavorite(id);
        toast(added ? I18n.t('product_fav_added') : I18n.t('product_fav_removed'));
        fav.classList.toggle('active', added);
        const svg = fav.querySelector('svg');
        if (svg) svg.setAttribute('fill', added ? 'currentColor' : 'none');
        syncCounts();
      }
    });
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function pickContact(s, key) {
    const fromContacts = s && s.contacts ? s.contacts[key] : undefined;
    if (fromContacts !== undefined && fromContacts !== null) return String(fromContacts).trim();
    const fromSocial = s && s.social ? s.social[key] : undefined;
    return String(fromSocial || '').trim();
  }

  /** Turn @user / t.me/user / phone into a clickable absolute URL. */
  function normalizeContactHref(key, raw) {
    let v = String(raw || '').trim();
    if (!v) return '';
    if (key === 'email') return v;
    if (/^https?:\/\//i.test(v)) return v;

    if (key === 'telegram') {
      v = v.replace(/^(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me)\//i, '').replace(/^@+/, '');
      const user = v.split(/[/?#\s]/)[0].replace(/^@+/, '');
      return user ? `https://t.me/${user}` : '';
    }

    if (key === 'instagram') {
      v = v.replace(/^(?:https?:\/\/)?(?:www\.)?instagram\.com\//i, '').replace(/^@+/, '');
      const user = v.split(/[/?#\s]/)[0].replace(/^@+/, '');
      return user ? `https://instagram.com/${user}` : '';
    }

    if (key === 'whatsapp') {
      const lower = v.toLowerCase();
      if (lower.includes('wa.me') || lower.includes('whatsapp.com') || lower.includes('api.whatsapp')) {
        return lower.startsWith('http') ? v : `https://${v.replace(/^\/\//, '')}`;
      }
      const digits = v.replace(/[^\d]/g, '');
      return digits ? `https://wa.me/${digits}` : '';
    }

    return v;
  }

  function contactLabel(url) {
    const v = String(url || '').trim();
    if (!v) return '';
    if (v.includes('@') && !/^https?:\/\//i.test(v) && !v.includes('t.me')) {
      return v.startsWith('@') ? v : '@' + v;
    }
    const path = v.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split(/[?#]/)[0];
    const parts = path.split('/').filter(Boolean);
    let last = parts[parts.length - 1] || '';
    try { last = decodeURIComponent(last); } catch (_) { /* keep */ }
    if (!last) return v;
    if (/^\d+$/.test(last)) return last.length >= 10 ? '+' + last : last;
    if (last.includes('.')) return v;
    return last.startsWith('@') ? last : '@' + last;
  }

  return {
    renderHeader,
    renderFooter,
    cardHTML,
    renderGrid,
    bindCardEvents,
    toast,
    syncCounts,
    escapeHtml,
    pickContact,
    normalizeContactHref,
    contactLabel,
    ratingStars,
    getSettings,
    payRequisitesHTML,
    bindPayRequisites,
    getReceiptDataURL,
    readFileAsDataURL,
  };
})();
