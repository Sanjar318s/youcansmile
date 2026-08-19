/* ============================================================
   YoucanSmile — админ-панель
   Товары, категории, заказы, настройки, бэкап.
   ============================================================ */
(function initAdmin() {
  document.documentElement.lang = I18n.lang;
  applyI18n();

  let settings = null;
  let currentTab = 'dash';

  const loginCard = document.getElementById('loginCard');
  const layout = document.getElementById('adminLayout');
  const logoutBtn = document.getElementById('logoutBtn');
  const topTitle = document.getElementById('adminTopTitle');
  const navBtns = [...document.querySelectorAll('.admin-nav button')];
  const content = document.getElementById('adminContent');

  content.addEventListener('click', async (e) => {
    const copyBtn = e.target.closest('.js-copy-status');
    if (!copyBtn || !content.contains(copyBtn)) return;
    const url = copyBtn.dataset.url || '';
    try {
      await navigator.clipboard.writeText(url);
      UI.toast(I18n.t('admin_order_link_copied'));
    } catch (_) {
      UI.toast(url);
    }
  });

  /** Подсказка «?» для полей админки */
  function adminLabel(text, helpKey) {
    return `<span class="admin-label-row">${UI.escapeHtml(text)}<button type="button" class="admin-help-btn" data-help="${helpKey}" aria-label="${I18n.t('admin_help_btn')}">?</button></span>`;
  }

  function closeAdminHelp() {
    document.querySelectorAll('.admin-help-overlay').forEach((el) => el.remove());
  }

  function bindAdminHelp(root) {
    if (!root) return;
    root.querySelectorAll('.admin-help-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeAdminHelp();
        const key = btn.dataset.help;
        const text = I18n.t(key);
        const overlay = document.createElement('div');
        overlay.className = 'admin-help-overlay';
        overlay.innerHTML = `
          <div class="admin-help-dialog" role="dialog" aria-modal="true">
            <p>${UI.escapeHtml(text)}</p>
            <button type="button" class="btn btn-primary btn-sm admin-help-close">${I18n.t('admin_help_ok')}</button>
          </div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (ev) => {
          if (ev.target === overlay || ev.target.closest('.admin-help-close')) closeAdminHelp();
        });
      });
    });
  }

  /* ---------- картинка из файла (базовый ресайз) --------- */
  function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const maxW = 900;
          const scale = Math.min(1, maxW / img.width);
          const w = Math.round(img.width * scale);
          const h = Math.round(img.height * scale);
          const cv = document.createElement('canvas');
          cv.width = w;
          cv.height = h;
          cv.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(cv.toDataURL('image/jpeg', 0.82));
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /** Товарные фото: сжатие + лёгкое улучшение */
  async function optimizeProductImage(input) {
    if (typeof ImageOptimize !== 'undefined') {
      const out = await ImageOptimize.product(input);
      return out.dataUrl;
    }
    if (typeof input === 'string') return input;
    return fileToDataURL(input);
  }

  /* ============================ ВХОД ======================== */
  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const pass = document.getElementById('loginPass').value;
    const res = await Api.login(email, pass);
    if (res.ok) {
      document.getElementById('loginErr').classList.add('hidden');
      enterApp();
      if (typeof YcsPush !== 'undefined') YcsPush.subscribe(true);
    } else {
      document.getElementById('loginErr').classList.remove('hidden');
    }
  });

  logoutBtn.addEventListener('click', async () => {
    await Api.logout();
    location.reload();
  });

  async function enterApp() {
    settings = await Api.getSettings();
    loginCard.classList.add('hidden');
    layout.classList.remove('hidden');
    logoutBtn.classList.remove('hidden');
    topTitle.textContent = I18n.t('admin_title');
    navBtns.forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));
    if (typeof UI !== 'undefined' && UI.bindHScroll) {
      UI.bindHScroll(document.getElementById('adminNavWrap'), '#adminNav');
    }
    switchTab('dash');
  }

  function switchTab(tab) {
    currentTab = tab;
    navBtns.forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    applyI18n(content);
    renderers[tab]();
  }

  /* ======================= РЕНДЕРЫ ========================== */
  const renderers = {
    dash: renderDash,
    products: renderProducts,
    categories: renderCategories,
    orders: renderOrders,
    slider: renderSlider,
    settings: renderSettings,
  };

  /* -------------------------- дашборд ---------------------- */
  async function renderDash() {
    const [prods, cats, orders] = await Promise.all([Api.getProducts(), Api.getCategories(), Api.getOrders()]);
    const revenue = orders.filter((o) => o.status !== 'cancelled').reduce((s, o) => s + (o.total || 0), 0);
    const outOfStock = prods.filter((p) => !p.inStock).length;
    const newOrders = orders.filter((o) => o.status === 'new').length;
    content.innerHTML = `
      <div class="dash-head">
        <div>
          <span class="dash-kicker">${I18n.t('admin_title')}</span>
          <h2 class="dash-title">${I18n.t('admin_dash')}</h2>
        </div>
        <p class="dash-note">${I18n.t('admin_settings_note')}</p>
      </div>
      <div class="stats-grid">
        <div class="stat-card toned-products">
          <div class="stat-ico" aria-hidden="true">📦</div>
          <div class="stat-body">
            <div class="stat-num">${prods.length}</div>
            <div class="stat-label">${I18n.t('admin_stats_products')}</div>
          </div>
        </div>
        <div class="stat-card toned-cats">
          <div class="stat-ico" aria-hidden="true">🗂️</div>
          <div class="stat-body">
            <div class="stat-num">${cats.length}</div>
            <div class="stat-label">${I18n.t('admin_stats_categories')}</div>
          </div>
        </div>
        <div class="stat-card toned-orders">
          <div class="stat-ico" aria-hidden="true">🛍️</div>
          <div class="stat-body">
            <div class="stat-num">${orders.length}</div>
            <div class="stat-label">${I18n.t('admin_stats_orders')}</div>
            ${newOrders ? `<div class="stat-meta">${newOrders} new</div>` : ''}
          </div>
        </div>
        <div class="stat-card toned-revenue">
          <div class="stat-ico" aria-hidden="true">💎</div>
          <div class="stat-body">
            <div class="stat-num">${Store.formatPrice(revenue, settings)}</div>
            <div class="stat-label">${I18n.t('admin_stats_revenue')}</div>
          </div>
        </div>
        <div class="stat-card toned-stock">
          <div class="stat-ico" aria-hidden="true">⚠️</div>
          <div class="stat-body">
            <div class="stat-num">${outOfStock}</div>
            <div class="stat-label">${I18n.t('product_no_stock')}</div>
          </div>
        </div>
      </div>
      <div class="dash-quick">
        <button class="btn btn-primary btn-sm" data-jump="products">+ ${I18n.t('admin_add_product')}</button>
        <button class="btn btn-secondary btn-sm" data-jump="orders">${I18n.t('admin_orders')}</button>
        <button class="btn btn-ghost btn-sm" data-jump="settings">${I18n.t('admin_settings')}</button>
      </div>`;
    content.querySelectorAll('[data-jump]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.jump;
        const navBtn = document.querySelector(`.admin-nav button[data-tab="${tab}"]`);
        if (navBtn) navBtn.click();
      });
    });
  }

  /* ------------------------- товары ------------------------ */
  async function renderProducts() {
    const [prods, cats] = await Promise.all([Api.getProducts(), Api.getCategories()]);
    const catName = (id) => {
      const c = cats.find((c) => c.id === id);
      return c ? I18n.txt(c.name) : '—';
    };

    let filter = 'all';
    let query = '';

    function filtered() {
      const q = query.trim().toLowerCase();
      return prods.filter((p) => {
        if (filter === 'stock' && !p.inStock) return false;
        if (filter === 'out' && p.inStock) return false;
        if (filter === 'featured' && !p.featured) return false;
        if (!q) return true;
        const title = `${p.title?.ru || ''} ${p.title?.en || ''} ${p.title?.uz || ''}`.toLowerCase();
        return title.includes(q) || (p.tags || []).join(' ').toLowerCase().includes(q);
      });
    }

    function rowHTML(p) {
      const disc = Store.discountPercent(p);
      return `
        <tr data-id="${p.id}">
          <td class="col-thumb"><img class="adm-thumb" src="${p.images[0] || ''}" alt=""/></td>
          <td class="col-title">
            <b class="adm-prod-name">${UI.escapeHtml(I18n.txt(p.title))}</b>
            <span class="adm-prod-meta">${catName(p.categoryId)}</span>
          </td>
          <td class="col-price">
            <b>${Store.formatPrice(p.price, settings)}</b>
            ${p.oldPrice ? `<s>${Store.formatPrice(p.oldPrice, settings)}</s>` : ''}
          </td>
          <td class="col-disc">${disc ? `<span class="adm-badge sale">−${disc}%</span>` : '—'}</td>
          <td class="col-cat">${catName(p.categoryId)}</td>
          <td class="col-stock">${p.inStock ? '<span class="adm-badge ok">✓</span>' : '<span class="adm-badge bad">✕</span>'}</td>
          <td class="col-feat">${p.featured ? '<span class="adm-badge star">⭐</span>' : '—'}</td>
          <td class="col-actions">
            <div class="adm-row-actions">
              <button type="button" class="adm-edit" data-edit="${p.id}">${I18n.t('admin_edit')}</button>
              <button type="button" class="adm-del" data-del="${p.id}">${I18n.t('admin_delete')}</button>
            </div>
          </td>
        </tr>`;
    }

    function cardHTML(p) {
      const disc = Store.discountPercent(p);
      return `
        <article class="adm-prod-card" data-id="${p.id}">
          <img class="adm-prod-card-img" src="${p.images[0] || ''}" alt=""/>
          <div class="adm-prod-card-body">
            <div class="adm-prod-card-top">
              <b>${UI.escapeHtml(I18n.txt(p.title))}</b>
              <span class="adm-prod-meta">${catName(p.categoryId)}</span>
            </div>
            <div class="adm-prod-card-price">
              <b>${Store.formatPrice(p.price, settings)}</b>
              ${p.oldPrice ? `<s>${Store.formatPrice(p.oldPrice, settings)}</s>` : ''}
              ${disc ? `<span class="adm-badge sale">−${disc}%</span>` : ''}
            </div>
            <div class="adm-prod-card-flags">
              ${p.inStock ? '<span class="adm-badge ok">✓ in stock</span>' : '<span class="adm-badge bad">out</span>'}
              ${p.featured ? '<span class="adm-badge star">⭐</span>' : ''}
            </div>
            <div class="adm-row-actions">
              <button type="button" class="adm-edit" data-edit="${p.id}">${I18n.t('admin_edit')}</button>
              <button type="button" class="adm-del" data-del="${p.id}">${I18n.t('admin_delete')}</button>
            </div>
          </div>
        </article>`;
    }

    function paint() {
      const list = filtered();
      const rows = document.getElementById('prodRows');
      const cards = document.getElementById('prodCards');
      const empty = document.getElementById('prodEmpty');
      if (rows) rows.innerHTML = list.map(rowHTML).join('');
      if (cards) cards.innerHTML = list.map(cardHTML).join('');
      if (empty) empty.hidden = list.length > 0;
      bindRowActions();
    }

    function bindRowActions() {
      content.querySelectorAll('[data-edit]').forEach((b) => {
        b.onclick = () => productForm(b.dataset.edit);
      });
      content.querySelectorAll('[data-del]').forEach((b) => {
        b.onclick = async () => {
          if (!confirm(I18n.t('admin_delete_confirm'))) return;
          await Api.deleteProduct(b.dataset.del);
          UI.toast(I18n.t('admin_deleted'));
          renderProducts();
        };
      });
    }

    content.innerHTML = `
      <div class="adm-toolbar">
        <div class="adm-toolbar-text">
          <span class="dash-kicker">${I18n.t('admin_products')}</span>
          <h2 class="dash-title">${I18n.t('admin_products')}</h2>
        </div>
        <button class="btn btn-primary btn-sm" id="addProductBtn">+ ${I18n.t('admin_add_product')}</button>
      </div>
      <div class="adm-tools">
        <input class="adm-search" id="prodSearch" type="search" placeholder="Search…" autocomplete="off"/>
        <div class="adm-filter-chips" id="prodFilters">
          <button type="button" class="chip active" data-filter="all">${I18n.t('cat_all')}</button>
          <button type="button" class="chip" data-filter="stock">${I18n.t('filter_in_stock')}</button>
          <button type="button" class="chip" data-filter="out">${I18n.t('product_no_stock')}</button>
          <button type="button" class="chip" data-filter="featured">${I18n.t('admin_featured')}</button>
        </div>
      </div>
      <div class="adm-list-panel">
        <div class="table-scroll adm-desktop-only">
          <table class="adm-table">
            <thead><tr>
              <th class="col-thumb"></th>
              <th class="col-title">${I18n.t('admin_title_ru')}</th>
              <th class="col-price">${I18n.t('admin_price')}</th>
              <th class="col-disc">${I18n.t('admin_discount_percent')}</th>
              <th class="col-cat">${I18n.t('admin_category')}</th>
              <th class="col-stock">${I18n.t('admin_stock')}</th>
              <th class="col-feat">${I18n.t('admin_featured')}</th>
              <th class="col-actions"></th>
            </tr></thead>
            <tbody id="prodRows"></tbody>
          </table>
        </div>
        <div class="adm-prod-cards adm-mobile-only" id="prodCards"></div>
        <p class="adm-empty" id="prodEmpty" hidden>${I18n.t('admin_empty')}</p>
      </div>`;

    document.getElementById('addProductBtn').addEventListener('click', () => productForm());
    document.getElementById('prodSearch').addEventListener('input', (e) => {
      query = e.target.value || '';
      paint();
    });
    document.getElementById('prodFilters').querySelectorAll('.chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        filter = btn.dataset.filter || 'all';
        document.querySelectorAll('#prodFilters .chip').forEach((c) => c.classList.toggle('active', c === btn));
        paint();
      });
    });
    paint();
  }

  async function productForm(id) {
    try {
      const cats = await Api.getCategories();
      let p = null;
      if (id) {
        p = await Api.getProduct(id);
        if (!p) {
          UI.toast(I18n.t('admin_empty'));
          return;
        }
      }

      const loc = (obj, lang) => {
        if (!obj) return '';
        if (typeof obj === 'string') return obj;
        return String(obj[lang] || '');
      };

      const basePrice = p ? Number(p.oldPrice || p.price) || 0 : 0;
      const discPct = p && p.oldPrice && p.oldPrice > p.price
        ? Math.max(0, Math.min(90, Math.round((1 - Number(p.price) / Number(p.oldPrice)) * 100)))
        : 0;
      const imgs = (p && p.images) || [];

      content.innerHTML = `
      <div class="adm-form-head">
        <button class="btn btn-ghost btn-sm" id="backBtn" type="button">←</button>
        <h2>${p ? I18n.t('admin_edit_product') : I18n.t('admin_add_product')}</h2>
      </div>
      <form class="adm-form" id="prodForm">
        <div class="field full">
          <label>${I18n.t('admin_title_ru')}</label>
          <input id="fTitleRu" value="${UI.escapeHtml(loc(p && p.title, 'ru'))}" required/>
          <small class="field-hint">${I18n.t('admin_auto_translate_hint')}</small>
        </div>
        <div class="field full">
          <label>${I18n.t('admin_desc_ru')}</label>
          <textarea id="fDescRu">${UI.escapeHtml(loc(p && p.desc, 'ru'))}</textarea>
        </div>
        <div class="field">
          <label>${I18n.t('admin_base_price')}</label>
          <input id="fBasePrice" type="number" min="0" step="1000" value="${basePrice || ''}" required/>
        </div>
        <div class="field">
          <label>${I18n.t('admin_discount_pct')}</label>
          <div class="adm-disc-row">
            <input id="fDiscPct" type="number" min="0" max="90" step="1" value="${discPct}"/>
            <span class="adm-disc-unit">%</span>
            <input id="fDiscRange" type="range" min="0" max="70" step="1" value="${Math.min(70, discPct)}"/>
          </div>
        </div>
        <div class="field full adm-price-preview" id="pricePreview">
          <div class="adm-price-preview-label">${I18n.t('admin_final_price')}</div>
          <div class="adm-price-preview-vals">
            <b id="fFinalLabel">—</b>
            <s id="fOldLabel" class="hidden"></s>
            <span class="adm-badge sale hidden" id="fDiscBadge"></span>
          </div>
          <small>${I18n.t('admin_price_preview_hint')}</small>
        </div>
        <div class="field">
          <label>${I18n.t('admin_category')}</label>
          <select id="fCat" required>
            ${(cats || []).map((c) => `<option value="${c.id}" ${p && p.categoryId === c.id ? 'selected' : ''}>${UI.escapeHtml(I18n.txt(c.name))}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>${I18n.t('admin_tags')}</label>
          <input id="fTags" value="${p && p.tags ? UI.escapeHtml(p.tags.join(', ')) : ''}" placeholder="ручная работа, полимерная глина"/>
        </div>
        <div class="field">
          <label>${I18n.t('admin_stock')}</label>
          <label class="switch">
            <input type="checkbox" id="fStock" ${!p || p.inStock ? 'checked' : ''}/>
            <span class="slider"></span>
          </label>
        </div>
        <div class="field">
          <label>${I18n.t('admin_featured')}</label>
          <label class="switch">
            <input type="checkbox" id="fFeatured" ${p && p.featured ? 'checked' : ''}/>
            <span class="slider"></span>
          </label>
        </div>
        <div class="field full">
          <label>${I18n.t('admin_images')}</label>
          <p class="set-hint" style="margin:0 0 10px">${I18n.t('admin_images_optimize_hint')}</p>
          <div class="img-grid" id="imgGrid"></div>
          <label class="img-add" title="${I18n.t('admin_add_image')}">
            <input type="file" id="fFiles" accept="image/*" multiple style="display:none;"/>
            <span>+</span>
          </label>
        </div>
        <div class="full" style="display:flex; gap:12px; flex-wrap:wrap;">
          <button class="btn btn-primary" type="submit">${I18n.t('admin_save')}</button>
          <button class="btn btn-ghost" type="button" id="cancelBtn">${I18n.t('admin_cancel')}</button>
        </div>
      </form>`;

      window.scrollTo({ top: 0, behavior: 'smooth' });

      const imgGrid = document.getElementById('imgGrid');
      const state = { images: [...imgs] };

      function paintImages() {
        imgGrid.innerHTML = state.images
          .map(
            (src, i) => `
          <div class="img-item">
            <img src="${src}" alt=""/>
            <button type="button" data-rm="${i}">✕</button>
          </div>`
          )
          .join('');
        imgGrid.querySelectorAll('[data-rm]').forEach((b) =>
          b.addEventListener('click', (e) => {
            e.stopPropagation();
            state.images.splice(Number(b.dataset.rm), 1);
            paintImages();
          })
        );
        imgGrid.querySelectorAll('.img-item img').forEach((imgEl, i) => {
          imgEl.title = I18n.t('photo_editor_title');
          imgEl.addEventListener('click', async () => {
            if (typeof PhotoEditor === 'undefined') return;
            try {
              const edited = await PhotoEditor.open(state.images[i]);
              if (edited) {
                state.images[i] = edited;
                paintImages();
              }
            } catch (err) {
              console.error(err);
            }
          });
        });
      }
      paintImages();

      const baseEl = document.getElementById('fBasePrice');
      const pctEl = document.getElementById('fDiscPct');
      const rangeEl = document.getElementById('fDiscRange');
      const finalLabel = document.getElementById('fFinalLabel');
      const oldLabel = document.getElementById('fOldLabel');
      const discBadge = document.getElementById('fDiscBadge');

      function calcPrices() {
        const base = Math.max(0, Number(baseEl.value) || 0);
        let pct = Math.round(Number(pctEl.value) || 0);
        if (pct < 0) pct = 0;
        if (pct > 90) pct = 90;
        const final = pct > 0 ? Math.round(base * (1 - pct / 100)) : base;
        return { base, pct, final };
      }

      function syncPreview(fromRange) {
        if (fromRange) pctEl.value = rangeEl.value;
        else rangeEl.value = Math.min(70, Math.max(0, Number(pctEl.value) || 0));
        const { base, pct, final } = calcPrices();
        finalLabel.textContent = Store.formatPrice(final, settings);
        if (pct > 0 && base > final) {
          oldLabel.textContent = Store.formatPrice(base, settings);
          oldLabel.classList.remove('hidden');
          discBadge.textContent = `−${pct}%`;
          discBadge.classList.remove('hidden');
        } else {
          oldLabel.classList.add('hidden');
          discBadge.classList.add('hidden');
        }
      }

      baseEl.addEventListener('input', () => syncPreview(false));
      pctEl.addEventListener('input', () => syncPreview(false));
      rangeEl.addEventListener('input', () => syncPreview(true));
      syncPreview(false);

      document.getElementById('fFiles').addEventListener('change', async (e) => {
        const files = [...e.target.files];
        const input = e.target;
        if (!files.length) return;
        for (const f of files) {
          if (f.size > 20 * 1024 * 1024) {
            UI.toast(I18n.t('admin_image_too_large'));
            continue;
          }
          try {
            let dataUrl = null;
            if (typeof PhotoEditor !== 'undefined') {
              dataUrl = await PhotoEditor.open(f);
            }
            if (!dataUrl) continue;
            state.images.push(
              typeof ImageOptimize !== 'undefined'
                ? (await ImageOptimize.process(dataUrl, { contrast: 1, saturate: 1, brightness: 1 })).dataUrl
                : dataUrl
            );
          } catch (err) {
            console.error(err);
            UI.toast(I18n.t('admin_image_optimize_fail'));
          }
        }
        paintImages();
        input.value = '';
      });

      const back = () => renderProducts();
      document.getElementById('backBtn').addEventListener('click', back);
      document.getElementById('cancelBtn').addEventListener('click', back);

      document.getElementById('prodForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const { base, pct, final } = calcPrices();
        if (!base) {
          UI.toast(I18n.t('admin_base_price'));
          return;
        }
        const ruTitle = document.getElementById('fTitleRu').value.trim();
        const ruDesc = document.getElementById('fDescRu').value.trim();
        if (!ruTitle) return;

        const submitBtn = e.target.querySelector('button[type="submit"]');
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = I18n.t('admin_translating');
        }

        let title = { ru: ruTitle, en: ruTitle, uz: ruTitle };
        let desc = { ru: ruDesc, en: ruDesc, uz: ruDesc };
        try {
          const sameTitle = p && loc(p.title, 'ru') === ruTitle && (p.title.en || p.title.uz);
          const sameDesc = p && loc(p.desc, 'ru') === ruDesc && (p.desc && (p.desc.en || p.desc.uz));
          if (sameTitle) {
            title = {
              ru: ruTitle,
              en: p.title.en || ruTitle,
              uz: p.title.uz || ruTitle,
            };
          } else if (typeof Translate !== 'undefined') {
            title = await Translate.fromRu(ruTitle);
          }
          if (sameDesc) {
            desc = {
              ru: ruDesc,
              en: (p.desc && p.desc.en) || ruDesc,
              uz: (p.desc && p.desc.uz) || ruDesc,
            };
          } else if (typeof Translate !== 'undefined') {
            desc = await Translate.fromRu(ruDesc);
          }
        } catch (_) {
          /* keep ru fallbacks */
        }

        const data = {
          title,
          desc,
          price: final,
          oldPrice: pct > 0 ? base : null,
          categoryId: document.getElementById('fCat').value,
          tags: document.getElementById('fTags').value.split(',').map((t) => t.trim()).filter(Boolean),
          inStock: document.getElementById('fStock').checked,
          featured: document.getElementById('fFeatured').checked,
          images: await persistProductImages(state.images),
        };
        try {
          if (p) await Api.updateProduct(p.id, data);
          else await Api.createProduct(data);
          UI.toast(I18n.t('admin_saved'));
          renderProducts();
        } catch (err) {
          UI.toast(err && err.message ? err.message : 'Error');
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = I18n.t('admin_save');
          }
        }
      });
    } catch (err) {
      console.error(err);
      UI.toast(err && err.message ? err.message : 'Error');
    }
  }

  async function persistProductImages(images) {
    const out = [];
    for (const img of images || []) {
      if (typeof img === 'string' && img.startsWith('data:')) {
        try {
          const mimeMatch = img.match(/^data:([^;]+);/);
          const mime = (mimeMatch && mimeMatch[1]) || 'image/jpeg';
          const up = await Api.uploadMedia(img, mime);
          out.push(up.url || img);
        } catch (_) {
          out.push(img);
        }
      } else if (img) {
        out.push(img);
      }
    }
    return out.length ? out : ['img/logo-ycs.png'];
  }

  /* ------------------------ категории ---------------------- */
  async function renderCategories() {
    const cats = await Api.getCategories({ bust: true });
    content.innerHTML = `
      <h2 style="font-size:1.4rem; margin-bottom:22px;">🏷️ ${I18n.t('admin_categories')}</h2>
      <div class="adm-toolbar">
        <input id="newCatIcon" style="width:70px; padding:11px; border:2px solid var(--border); border-radius:12px; text-align:center;" placeholder="😊"/>
        <input id="newCatRu" style="flex:1; min-width:120px; padding:11px 14px; border:2px solid var(--border); border-radius:12px;" placeholder="${I18n.t('admin_name_ru')}"/>
        <input id="newCatEn" style="flex:1; min-width:120px; padding:11px 14px; border:2px solid var(--border); border-radius:12px;" placeholder="${I18n.t('admin_name_en')} (${I18n.t('admin_optional') || 'необяз.'})"/>
        <button class="btn btn-primary btn-sm" id="addCatBtn">+ ${I18n.t('admin_add_category')}</button>
      </div>
      <div class="adm-toolbar" style="margin-top:14px;">
        ${cats
          .map(
            (c) => `
          <div style="display:flex; gap:8px; align-items:center; background:var(--glass-bg); border:1px solid var(--glass-border); padding:10px 14px; border-radius:12px;">
            <span style="font-size:1.4rem;">${c.icon || ''}</span>
            <span style="font-weight:800;">${UI.escapeHtml(I18n.txt(c.name))}</span>
            <button class="adm-edit" data-ce="${c.id}" style="padding:4px 10px;">✏️</button>
            <button class="adm-del" data-cd="${c.id}" style="padding:4px 10px;">🗑️</button>
          </div>`
          )
          .join('')}
      </div>`;

    document.getElementById('addCatBtn').addEventListener('click', async () => {
      const icon = document.getElementById('newCatIcon').value.trim() || '🎁';
      const ru = document.getElementById('newCatRu').value.trim();
      const en = document.getElementById('newCatEn').value.trim();
      if (!ru) {
        UI.toast(I18n.t('admin_cat_name_required') || 'Укажите название на русском');
        document.getElementById('newCatRu').focus();
        return;
      }
      try {
        await Api.createCategory({ icon, name: { ru, en: en || ru, uz: ru } });
        UI.toast(I18n.t('admin_saved'));
        document.getElementById('newCatRu').value = '';
        document.getElementById('newCatEn').value = '';
        document.getElementById('newCatIcon').value = '';
        renderCategories();
      } catch (err) {
        console.error(err);
        UI.toast((I18n.t('admin_save_failed') || 'Ошибка сохранения') + ': ' + (err.message || err));
      }
    });
    content.querySelectorAll('[data-ce]').forEach((b) =>
      b.addEventListener('click', async () => {
        const c = cats.find((x) => x.id === b.dataset.ce);
        if (!c) return;
        const icon = prompt('Icon', c.icon || '');
        if (icon === null) return;
        const ru = prompt(I18n.t('admin_name_ru'), c.name.ru);
        if (ru === null) return;
        const en = prompt(I18n.t('admin_name_en'), c.name.en);
        if (en === null) return;
        await Api.updateCategory(c.id, { icon: icon || '🎁', name: { ru, en } });
        UI.toast(I18n.t('admin_saved'));
        renderCategories();
      })
    );
    content.querySelectorAll('[data-cd]').forEach((b) =>
      b.addEventListener('click', async () => {
        if (!confirm('Удалить категорию?')) return;
        await Api.deleteCategory(b.dataset.cd);
        UI.toast(I18n.t('admin_deleted'));
        renderCategories();
      })
    );
  }

  /* --------------------------- заказы ---------------------- */
  const ORDER_STATUSES = ['new', 'processing', 'contacting', 'in_progress', 'done', 'cancelled'];

  function normalizeStatus(status) {
    return ORDER_STATUSES.includes(status) ? status : 'new';
  }

  function statusLabel(status) {
    const key = {
      new: 'admin_order_new',
      processing: 'admin_order_processing',
      contacting: 'admin_order_contacting',
      in_progress: 'admin_order_in_progress',
      done: 'admin_order_done',
      cancelled: 'admin_order_cancel',
    }[normalizeStatus(status)];
    return I18n.t(key);
  }

  function orderStatusPageUrl(id) {
    const base = `${location.origin}${location.pathname.replace(/[^/]*$/, '')}`;
    return `${base}order-status.html?id=${encodeURIComponent(id)}`;
  }

  function orderWho(o) {
    const c = o.customer || {};
    if (c.contact && String(c.contact).trim()) return String(c.contact).trim();
    return I18n.t('admin_order_guest') + (c.name ? ` (${c.name})` : '');
  }

  function orderTypeLabel(o) {
    if (o.type === 'custom') return `🔥 ${I18n.t('admin_order_custom')}`;
    const first = (o.items || [])[0];
    if (first && first.title) return first.title;
    return I18n.t('admin_order_cart');
  }

  function orderNote(o) {
    return (o.customDescription || (o.customer && o.customer.note) || '').trim();
  }

  function payLabel(v) {
    if (v === 'cash') return I18n.t('pay_cash');
    if (v === 'card') return I18n.t('pay_card');
    return v || '';
  }

  function fulfillLabel(v) {
    if (v === 'pickup') return I18n.t('fulfill_pickup');
    if (v === 'delivery') return I18n.t('fulfill_delivery');
    return v || '';
  }

  function channelLabel(v) {
    if (v === 'instagram') return I18n.t('contact_instagram');
    if (v === 'telegram') return I18n.t('contact_telegram');
    return v || '';
  }

  function pickupLabel(id) {
    if (!id) return '';
    const pts = (settings && settings.pickupPoints) || [];
    const p = pts.find((x) => x.id === id);
    return p ? I18n.txt(p.name) || p.id : id;
  }

  function stripAt(user) {
    return String(user || '').trim().replace(/^@+/, '');
  }

  function buildStatusNotifyMessage(order, status) {
    const url = orderStatusPageUrl(order.id);
    const numLabel = Store.orderNumberLabel(order);
    return I18n.t('admin_order_notify_msg')
      .replace(/\{id\}/g, numLabel)
      .replace(/\{status\}/g, statusLabel(status))
      .replace(/\{url\}/g, url);
  }

  function buildNotifyLinks(order, msg) {
    const c = order.customer || {};
    const s = settings || {};
    const encoded = encodeURIComponent(msg);
    let tg = '';
    const nick = stripAt(c.contact);
    if (c.contactChannel === 'telegram' && nick) {
      tg = `https://t.me/${encodeURIComponent(nick)}?text=${encoded}`;
    } else {
      const raw = (s.contacts && s.contacts.telegram) || (s.social && s.social.telegram) || '';
      if (raw.includes('t.me/')) {
        tg = raw.includes('?') ? `${raw}&text=${encoded}` : `${raw}?text=${encoded}`;
      } else if (raw) {
        tg = `https://t.me/${encodeURIComponent(stripAt(raw))}?text=${encoded}`;
      }
    }
    let wa = '';
    const waRaw = (s.contacts && s.contacts.whatsapp) || (s.social && s.social.whatsapp) || '';
    if (waRaw) {
      if (waRaw.includes('wa.me') || waRaw.includes('whatsapp')) {
        wa = waRaw.includes('?') ? `${waRaw}&text=${encoded}` : `${waRaw}?text=${encoded}`;
      } else {
        const digits = waRaw.replace(/\D/g, '');
        if (digits) wa = `https://wa.me/${digits}?text=${encoded}`;
      }
    }
    return { tg, wa, url: orderStatusPageUrl(order.id) };
  }

  function statusOptionsHTML(current) {
    const cur = normalizeStatus(current);
    return ORDER_STATUSES.map(
      (st) => `<option value="${st}" ${st === cur ? 'selected' : ''}>${statusLabel(st)}</option>`
    ).join('');
  }

  function orderDetailsHTML(o) {
    const c = o.customer || {};
    const note = orderNote(o);
    const rows = [];
    const statusUrl = orderStatusPageUrl(o.id);

    rows.push(`
      <div class="oc-block">
        <div class="oc-label">${I18n.t('admin_order_status_page')}</div>
        <div class="oc-status-link">
          <input type="text" readonly value="${UI.escapeHtml(statusUrl)}" class="oc-status-input"/>
          <button type="button" class="btn btn-secondary btn-sm js-copy-status" data-url="${UI.escapeHtml(statusUrl)}">${I18n.t('admin_order_copy_link')}</button>
        </div>
      </div>`);

    if (note) {
      rows.push(`
        <div class="oc-block">
          <div class="oc-label">${I18n.t('admin_order_desc')}</div>
          <div class="oc-text">${UI.escapeHtml(note)}</div>
        </div>`);
    }

    if (o.items && o.items.length) {
      rows.push(`
        <div class="oc-block">
          <div class="oc-label">${I18n.t('admin_order_items')}</div>
          <ul class="oc-list">
            ${o.items
              .map(
                (i) =>
                  `<li>${UI.escapeHtml(i.title)} × ${i.qty} = ${Store.formatPrice(i.price * i.qty, settings)}</li>`
              )
              .join('')}
          </ul>
        </div>`);
    }

    const contactBits = [];
    if (c.name) contactBits.push(`<div><b>${I18n.t('admin_order_name')}:</b> ${UI.escapeHtml(c.name)}</div>`);
    if (c.phone) contactBits.push(`<div><b>${I18n.t('admin_order_phone')}:</b> ${UI.escapeHtml(c.phone)}</div>`);
    if (c.contact) {
      contactBits.push(
        `<div><b>${channelLabel(c.contactChannel) || I18n.t('admin_order_contact')}:</b> ${UI.escapeHtml(c.contact)}</div>`
      );
    }
    if (c.email) contactBits.push(`<div><b>Email:</b> ${UI.escapeHtml(c.email)}</div>`);
    if (contactBits.length) {
      rows.push(`
        <div class="oc-block">
          <div class="oc-label">${I18n.t('admin_order_contacts')}</div>
          <div class="oc-kv">${contactBits.join('')}</div>
        </div>`);
    }

    const shipBits = [];
    if (o.fulfillment) shipBits.push(`<div><b>${I18n.t('admin_order_fulfillment')}:</b> ${UI.escapeHtml(fulfillLabel(o.fulfillment))}</div>`);
    if (o.fulfillment === 'pickup' && o.pickupPoint) {
      shipBits.push(`<div><b>${I18n.t('admin_order_pickup')}:</b> ${UI.escapeHtml(pickupLabel(o.pickupPoint))}</div>`);
    }
    if (c.address) shipBits.push(`<div><b>${I18n.t('admin_order_address')}:</b> ${UI.escapeHtml(c.address)}</div>`);
    if (o.coords && Array.isArray(o.coords) && o.coords.length === 2) {
      shipBits.push(`<div><b>${I18n.t('admin_order_coords')}:</b> ${UI.escapeHtml(o.coords.join(', '))}</div>`);
    }
    if (shipBits.length) {
      rows.push(`
        <div class="oc-block">
          <div class="oc-label">${I18n.t('admin_order_shipping')}</div>
          <div class="oc-kv">${shipBits.join('')}</div>
        </div>`);
    }

    if (o.payment) {
      rows.push(`
        <div class="oc-block">
          <div class="oc-label">${I18n.t('admin_order_payment')}</div>
          <div class="oc-kv">${UI.escapeHtml(payLabel(o.payment))}</div>
        </div>`);
    }

    const imgs = [];
    if (o.characterImage) {
      imgs.push(`
        <a class="oc-thumb" href="${o.characterImage}" target="_blank" rel="noopener" title="${I18n.t('admin_order_character_photo')}">
          <img src="${o.characterImage}" alt="${I18n.t('admin_order_character_photo')}"/>
          <span>${I18n.t('admin_order_character_photo')}</span>
        </a>`);
    }
    if (o.paymentReceipt) {
      imgs.push(`
        <a class="oc-thumb" href="${o.paymentReceipt}" target="_blank" rel="noopener" title="${I18n.t('admin_order_receipt_photo')}">
          <img src="${o.paymentReceipt}" alt="${I18n.t('admin_order_receipt_photo')}"/>
          <span>${I18n.t('admin_order_receipt_photo')}</span>
        </a>`);
    }
    if (imgs.length) {
      rows.push(`
        <div class="oc-block">
          <div class="oc-label">${I18n.t('admin_order_photos')}</div>
          <div class="oc-thumbs">${imgs.join('')}</div>
        </div>`);
    }

    return `<div class="oc-details" hidden>${rows.join('')}</div>`;
  }

  function notifyClient(order, status) {
    const msg = buildStatusNotifyMessage(order, status);
    return buildNotifyLinks(order, msg);
  }

  function orderCardHTML(o) {
    const note = orderNote(o);
    const who = orderWho(o);
    const type = orderTypeLabel(o);
    const status = normalizeStatus(o.status);
    const created = o.createdAt ? new Date(o.createdAt) : null;
    const dateStr = created
      ? created.toLocaleDateString('ru-RU', { timeZone: 'Asia/Tashkent' })
      : '';
    const timeStr = created
      ? created.toLocaleTimeString('ru-RU', { timeZone: 'Asia/Tashkent' })
      : '';
    return `
        <div class="order-card" data-order-id="${UI.escapeHtml(o.id)}" data-status="${status}">
          <div class="oc-head">
            <div class="oc-title">
              <span class="oc-id">${UI.escapeHtml(Store.orderNumberLabel(o))}</span>
              <span class="oc-sep">—</span>
              <span class="oc-who">${UI.escapeHtml(who)}</span>
              <span class="oc-sep">·</span>
              <span class="oc-badge ${o.type === 'custom' ? 'custom' : 'cart'}">${UI.escapeHtml(type)}</span>
            </div>
            <button type="button" class="btn btn-sm btn-danger js-order-delete" data-order="${UI.escapeHtml(o.id)}" title="${I18n.t('admin_order_delete')}">${I18n.t('admin_order_delete')}</button>
          </div>
          <div class="oc-meta">
            ${o.customer?.phone ? `<span>📞 ${UI.escapeHtml(o.customer.phone)}</span>` : ''}
            ${dateStr ? `<span class="oc-dt">📅 ${UI.escapeHtml(dateStr)}</span>` : ''}
            ${timeStr ? `<span class="oc-dt">🕒 ${UI.escapeHtml(timeStr)}</span>` : ''}
            <span class="oc-total">${Store.formatPrice(o.total, settings)}</span>
            <span class="order-status ${status}">${statusLabel(status)}</span>
          </div>
          ${
            note
              ? `<div class="oc-preview"><span class="oc-preview-ico">📝</span><span class="oc-preview-text">${UI.escapeHtml(note)}</span></div>`
              : ''
          }
          <div class="oc-actions">
            <select class="js-status-select" data-order="${UI.escapeHtml(o.id)}" aria-label="${I18n.t('admin_order_status')}">
              ${statusOptionsHTML(status)}
            </select>
            <button type="button" class="btn btn-primary btn-sm js-status-update" data-order="${UI.escapeHtml(o.id)}">${I18n.t('admin_order_update_status')}</button>
            <button type="button" class="btn btn-secondary btn-sm js-order-more" aria-expanded="false">${I18n.t('admin_order_more')}</button>
          </div>
          <div class="oc-notify hidden" data-notify="${UI.escapeHtml(o.id)}"></div>
          ${orderDetailsHTML(o)}
        </div>`;
  }

  function bindOrderCardEvents(root) {
    root.querySelectorAll('.js-status-update').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.order;
        const card = btn.closest('.order-card');
        const sel = card?.querySelector('.js-status-select');
        if (!sel) return;
        const status = normalizeStatus(sel.value);
        btn.disabled = true;
        try {
          const updated = await Api.updateOrder(id, { status });
          if (!updated || normalizeStatus(updated.status) !== status) {
            UI.toast(I18n.t('order_status_update_fail'));
            return;
          }
          // In-app chat + push already sent by API — do NOT open Telegram
          const flags = [];
          if (updated.chatNotified) flags.push('чат ✓');
          if (updated.pushNotified) flags.push('push ✓');
          UI.toast(
            flags.length
              ? `${I18n.t('order_status_updated')} · ${flags.join(' · ')}`
              : I18n.t('order_status_updated')
          );
          await renderOrders();
        } catch (err) {
          UI.toast(err.message || I18n.t('order_status_update_fail'));
        } finally {
          btn.disabled = false;
        }
      });
    });

    root.querySelectorAll('.js-order-delete').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.order;
        if (!id) return;
        if (!window.confirm(I18n.t('admin_order_delete_confirm'))) return;
        btn.disabled = true;
        try {
          await Api.deleteOrder(id);
          UI.toast(I18n.t('admin_order_deleted'));
          await renderOrders();
        } catch (err) {
          UI.toast(err.message || I18n.t('admin_order_delete_fail'));
          btn.disabled = false;
        }
      });
    });

    root.querySelectorAll('.js-order-more').forEach((btn) => {
      btn.addEventListener('click', () => {
        const card = btn.closest('.order-card');
        const panel = card?.querySelector('.oc-details');
        if (!panel) return;
        const open = panel.hasAttribute('hidden');
        if (open) panel.removeAttribute('hidden');
        else panel.setAttribute('hidden', '');
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        btn.textContent = open ? I18n.t('admin_order_hide') : I18n.t('admin_order_more');
        card.classList.toggle('is-open', open);
      });
    });
  }

  async function renderOrders() {
    const orders = await Api.getOrders();
    const sorted = (orders || []).slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const byStatus = {};
    ORDER_STATUSES.forEach((st) => {
      byStatus[st] = [];
    });
    sorted.forEach((o) => {
      const st = normalizeStatus(o.status);
      byStatus[st].push(o);
    });

    const nav = ORDER_STATUSES.map((st) => {
      const n = byStatus[st].length;
      return `<a class="orders-status-pill ${st}" href="#orders-${st}"><span>${statusLabel(st)}</span><b>${n}</b></a>`;
    }).join('');

    const sections = ORDER_STATUSES.map((st) => {
      const list = byStatus[st];
      const body = list.length
        ? list.map(orderCardHTML).join('')
        : `<p class="orders-section-empty">${I18n.t('admin_empty')}</p>`;

      // New orders: always visible, no accordion
      if (st === 'new') {
        return `
        <section class="orders-section orders-section-fixed is-open" id="orders-new" data-status="new">
          <div class="orders-section-heading">
            <span class="order-status new">${statusLabel('new')}</span>
            <span class="orders-section-count">${list.length}</span>
          </div>
          <div class="orders-section-list">${body}</div>
        </section>`;
      }

      const open = list.length > 0;
      return `
        <section class="orders-section${open ? ' is-open' : ''}" id="orders-${st}" data-status="${st}">
          <button type="button" class="orders-section-title js-orders-toggle" aria-expanded="${open ? 'true' : 'false'}">
            <span class="orders-section-chevron" aria-hidden="true"></span>
            <span class="order-status ${st}">${statusLabel(st)}</span>
            <span class="orders-section-count">${list.length}</span>
          </button>
          <div class="orders-section-list"${open ? '' : ' hidden'}>${body}</div>
        </section>`;
    }).join('');

    content.innerHTML = `
      <h2 style="font-size:1.4rem; margin-bottom:16px;">📋 ${I18n.t('admin_orders')}</h2>
      <div class="orders-status-nav">${nav}</div>
      ${sorted.length ? sections : `<p style="color:var(--ink-soft);">${I18n.t('admin_empty')}</p>`}`;

    bindOrderCardEvents(content);

    content.querySelectorAll('.js-orders-toggle').forEach((btn) => {
      btn.addEventListener('click', () => {
        const section = btn.closest('.orders-section');
        const listEl = section?.querySelector('.orders-section-list');
        if (!section || !listEl) return;
        const open = !section.classList.contains('is-open');
        section.classList.toggle('is-open', open);
        listEl.classList.toggle('hidden', !open);
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    });

    content.querySelectorAll('.orders-status-pill').forEach((a) => {
      a.addEventListener('click', (e) => {
        const href = a.getAttribute('href') || '';
        const id = href.replace(/^#/, '');
        const section = id ? document.getElementById(id) : null;
        if (!section) return;
        e.preventDefault();
        const btn = section.querySelector('.js-orders-toggle');
        const listEl = section.querySelector('.orders-section-list');
        section.classList.add('is-open');
        if (listEl) listEl.classList.remove('hidden');
        if (btn) btn.setAttribute('aria-expanded', 'true');
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  const SITE_TEXT_GROUPS = [
    {
      title: 'Главная — hero',
      fields: [
        { store: 'heroTitle', label: 'Hero title' },
        { store: 'heroSubtitle', label: 'Hero subtitle', area: true },
        { store: 'announcement', label: 'Announcement' },
        { key: 'sage_hero_cta', label: 'Кнопка «Смотреть коллекцию»' },
        { key: 'sage_hero_custom', label: 'Кнопка «Индивидуальный заказ»' },
      ],
    },
    {
      title: 'Главная — блоки',
      fields: [
        { key: 'cat_cats_title', label: 'Заголовок категорий' },
        { key: 'promo_kicker', label: 'Промо — надзаголовок' },
        { key: 'promo_title', label: 'Промо — заголовок' },
        { key: 'sage_featured_kicker', label: 'Хиты — надзаголовок' },
        { key: 'sage_featured_title', label: 'Хиты — заголовок' },
        { key: 'sage_filter_all', label: 'Фильтр: все' },
        { key: 'sage_filter_male', label: 'Фильтр: мужские' },
        { key: 'sage_filter_female', label: 'Фильтр: женские' },
        { key: 'view_all', label: 'Кнопка «Смотреть все»' },
        { key: 'sage_philosophy_kicker', label: 'О нас — надзаголовок' },
        { key: 'sage_philosophy_title', label: 'О нас — заголовок' },
        { key: 'sage_philosophy_sub', label: 'О нас — подзаголовок' },
        { store: 'about', label: 'О нас — текст', area: true },
        { key: 'faq_title', label: 'FAQ — заголовок' },
        { key: 'faq_q1', label: 'FAQ вопрос 1' },
        { key: 'faq_a1', label: 'FAQ ответ 1', area: true },
        { key: 'faq_q2', label: 'FAQ вопрос 2' },
        { key: 'faq_a2', label: 'FAQ ответ 2', area: true },
        { key: 'faq_q3', label: 'FAQ вопрос 3' },
        { key: 'faq_a3', label: 'FAQ ответ 3', area: true },
        { key: 'shipping_title', label: 'Доставка — заголовок' },
        { key: 'shipping_pickup_text', label: 'Текст самовывоза', area: true },
        { key: 'shipping_delivery_text', label: 'Текст доставки', area: true },
        { key: 'sage_footer_contact', label: 'Контакты — надзаголовок' },
        { key: 'nav_contacts', label: 'Контакты — заголовок' },
      ],
    },
    {
      title: 'Навигация и футер',
      fields: [
        { key: 'sage_nav_shop', label: 'Меню: Каталог' },
        { key: 'sage_nav_art', label: 'Меню: Брелки' },
        { key: 'sage_nav_jewelry', label: 'Меню: Украшения' },
        { key: 'sage_nav_about', label: 'Меню: О нас' },
        { key: 'sage_nav_custom', label: 'Меню: Индивидуальный заказ' },
        { key: 'search_placeholder', label: 'Плейсхолдер поиска' },
        { store: 'footerAbout', label: 'О нас в футере', area: true },
        { key: 'sage_footer_links', label: 'Футер: разделы' },
        { key: 'sage_footer_faq', label: 'Футер: FAQ' },
        { key: 'sage_footer_shipping', label: 'Футер: доставка' },
        { key: 'sage_footer_follow', label: 'Футер: соцсети' },
        { key: 'footer_rights', label: 'Копирайт' },
        { key: 'footer_made', label: '«Сделано с любовью»' },
      ],
    },
    {
      title: 'Каталог и товар',
      fields: [
        { key: 'catalog_title', label: 'Каталог — заголовок' },
        { key: 'catalog_subtitle', label: 'Каталог — подзаголовок', area: true },
        { key: 'filter_category', label: 'Фильтр: категория' },
        { key: 'filter_price', label: 'Фильтр: цена' },
        { key: 'filter_only_discount', label: 'Только со скидкой' },
        { key: 'filter_in_stock', label: 'Только в наличии' },
        { key: 'filter_reset', label: 'Сбросить фильтры' },
        { key: 'sort_popular', label: 'Сортировка: популярные' },
        { key: 'sort_new', label: 'Сортировка: новые' },
        { key: 'sort_price_asc', label: 'Сортировка: дешевле' },
        { key: 'sort_price_desc', label: 'Сортировка: дороже' },
        { key: 'no_products', label: 'Ничего не найдено' },
        { key: 'product_add_bag', label: 'Кнопка «В корзину»' },
        { key: 'product_checkout_now', label: 'Кнопка «Оформить»' },
        { key: 'product_related', label: 'Похожие товары' },
        { key: 'product_in_stock', label: 'В наличии' },
        { key: 'product_no_stock', label: 'Нет в наличии' },
      ],
    },
    {
      title: 'Индивидуальный заказ',
      fields: [
        { key: 'custom_nav', label: 'Надзаголовок' },
        { key: 'custom_title', label: 'Заголовок' },
        { key: 'custom_sub', label: 'Подзаголовок', area: true },
        { key: 'custom_section_what', label: 'Секция: что нужно' },
        { key: 'custom_desc', label: 'Описание товара' },
        { key: 'custom_desc_ph', label: 'Плейсхолдер описания', area: true },
        { key: 'custom_character_photo', label: 'Референс — подпись' },
        { key: 'custom_character_photo_btn', label: 'Референс — кнопка' },
        { key: 'custom_section_contacts', label: 'Секция: контакты' },
        { key: 'custom_section_fulfill', label: 'Секция: получение' },
        { key: 'custom_section_pay', label: 'Секция: оплата' },
        { key: 'custom_submit', label: 'Кнопка отправки' },
        { key: 'custom_ok', label: 'Текст после заявки', area: true },
        { key: 'custom_seller_note', label: 'Примечание: продавец свяжется', area: true },
        { key: 'custom_success_title', label: 'Успех — заголовок' },
        { key: 'custom_success_sub', label: 'Успех — подпись', area: true },
      ],
    },
    {
      title: 'Корзина и оформление',
      fields: [
        { key: 'cart_title', label: 'Корзина — заголовок' },
        { key: 'cart_empty', label: 'Пустая корзина' },
        { key: 'cart_empty_cta', label: 'Кнопка «В каталог»' },
        { key: 'cart_summary', label: 'Ваш заказ' },
        { key: 'cart_items', label: 'Товаров на сумму' },
        { key: 'cart_total', label: 'Итого' },
        { key: 'cart_checkout', label: 'Оформить заказ' },
        { key: 'cart_delivery_note', label: 'Заметка про доставку', area: true },
        { key: 'order_title', label: 'Оформление — заголовок' },
        { key: 'checkout_via', label: 'Подсказка оформления', area: true },
        { key: 'order_name', label: 'Имя' },
        { key: 'order_phone', label: 'Телефон' },
        { key: 'contact_channel', label: 'Куда написать' },
        { key: 'contact_username', label: 'Юзернейм' },
        { key: 'fulfill_title', label: 'Способ получения' },
        { key: 'fulfill_pickup', label: 'Самовывоз' },
        { key: 'fulfill_delivery', label: 'Доставка' },
        { key: 'map_pickup_point', label: 'Точка самовывоза' },
        { key: 'map_title', label: 'Карта' },
        { key: 'map_address_manual', label: 'Адрес вручную' },
        { key: 'map_confirm_addr', label: 'Кнопка «Подтвердить адрес»' },
        { key: 'pay_title', label: 'Способ оплаты' },
        { key: 'pay_card', label: 'Карта' },
        { key: 'pay_cash', label: 'Наличные' },
        { key: 'pay_card_only', label: 'Только карта при доставке', area: true },
        { key: 'pay_requisites', label: 'Реквизиты — заголовок' },
        { key: 'pay_deadline_note', label: 'Заметка про оплату', area: true },
        { key: 'pay_attach_receipt', label: 'Прикрепить чек' },
        { key: 'order_note', label: 'Комментарий к заказу' },
        { key: 'order_btn', label: 'Отправить заказ' },
        { key: 'order_ok', label: 'Спасибо за заказ', area: true },
        { key: 'order_send_whatsapp', label: 'Отправить в WhatsApp' },
        { key: 'order_send_telegram', label: 'Отправить в Telegram' },
        { key: 'fav_title', label: 'Избранное' },
        { key: 'fav_empty', label: 'Пустое избранное', area: true },
        { key: 'order_status_title', label: 'Статус заказа — заголовок' },
        { key: 'order_status_hint', label: 'Статус заказа — подсказка', area: true },
      ],
    },
  ];

  function readLangGroup(selectorAttr, name) {
    const o = { ru: '', uz: '', en: '' };
    document.querySelectorAll(`[${selectorAttr}="${name}"]`).forEach((el) => {
      const lang = el.dataset.lang;
      if (lang) o[lang] = el.value.trim();
    });
    return o;
  }

  /* ------------------------- настройки --------------------- */
  /* ------------------------- слайдер ----------------------- */
  async function renderSlider() {
    settings = await Api.getSettings();
    const PRESETS = [
      { id: 'aurora', label: 'Aurora' },
      { id: 'sage', label: 'Sage' },
      { id: 'coral', label: 'Coral' },
      { id: 'violet', label: 'Violet' },
      { id: 'cream', label: 'Cream' },
    ];
    const TONES = ['sage', 'coral', 'cream', 'purple'];
    const TONE_LABELS = {
      sage: 'admin_tone_sage',
      coral: 'admin_tone_coral',
      cream: 'admin_tone_cream',
      purple: 'admin_tone_purple',
    };
    const SLIDE_LINKS = [
      { value: 'catalog.html', labelKey: 'admin_slide_link_catalog' },
      { value: 'catalog.html?cat=keychains', labelKey: 'admin_slide_link_keychains' },
      { value: 'catalog.html?cat=pendants', labelKey: 'admin_slide_link_pendants' },
      { value: 'catalog.html?cat=bracelets', labelKey: 'admin_slide_link_bracelets' },
      { value: 'catalog.html?cat=chokers', labelKey: 'admin_slide_link_chokers' },
      { value: 'custom-order.html', labelKey: 'admin_slide_link_custom' },
      { value: 'index.html#faq', labelKey: 'admin_slide_link_faq' },
    ];

    function slideHrefOptions(current) {
      const cur = (current || 'catalog.html').trim();
      let html = SLIDE_LINKS.map(
        (l) =>
          `<option value="${l.value}"${cur === l.value ? ' selected' : ''}>${I18n.t(l.labelKey)}</option>`
      ).join('');
      if (cur && !SLIDE_LINKS.some((l) => l.value === cur)) {
        html += `<option value="${UI.escapeHtml(cur)}" selected>${UI.escapeHtml(cur)}</option>`;
      }
      return html;
    }

    function bgCfg() {
      return Object.assign(
        { bgMode: 'preset', preset: 'aurora', imageUrl: '', overlay: 0.35 },
        settings.promoSlider || {}
      );
    }

    function listView() {
      const bg = bgCfg();
      const promos = Array.isArray(settings.promos) ? settings.promos : [];
      const overlayPct = Math.round((Number(bg.overlay) || 0) * 100);

      content.innerHTML = `
        <h2 style="font-size:1.4rem; margin-bottom:18px;">🎞️ ${I18n.t('admin_slider')}</h2>

        <section class="adm-list-panel slider-bg-panel">
          <h3 class="slider-sec-title">${I18n.t('admin_slider_bg')}</h3>
          <div class="slider-mode-row">
            <label class="slider-mode-chip"><input type="radio" name="bgMode" value="preset" ${bg.bgMode !== 'image' ? 'checked' : ''}/> ${I18n.t('admin_slider_bg_preset')}</label>
            <label class="slider-mode-chip"><input type="radio" name="bgMode" value="image" ${bg.bgMode === 'image' ? 'checked' : ''}/> ${I18n.t('admin_slider_bg_image')}</label>
          </div>
          <div class="slider-presets" id="sliderPresets">
            ${PRESETS.map(
              (p) => `
              <button type="button" class="slider-preset-card${bg.preset === p.id ? ' is-active' : ''}" data-preset="${p.id}" data-bg="${p.id}" title="${p.label}">
                <span class="slider-preset-swatch" data-bg="${p.id}"></span>
                <span>${p.label}</span>
              </button>`
            ).join('')}
          </div>
          <div class="slider-image-row" id="sliderImageRow" ${bg.bgMode === 'image' ? '' : 'hidden'}>
            <div class="slider-image-preview" id="sliderImagePreview" ${bg.imageUrl ? `style="background-image:url('${UI.escapeHtml(bg.imageUrl)}')"` : ''}></div>
            <div class="slider-image-actions">
              <label class="btn btn-secondary btn-sm" style="cursor:pointer">
                ${I18n.t('admin_add_image')}
                <input type="file" id="sliderBgFile" accept="image/*" hidden/>
              </label>
              <div class="field" style="margin:12px 0 0">
                <label>${I18n.t('admin_slider_overlay')}: <strong id="overlayVal">${overlayPct}%</strong></label>
                <input type="range" id="sliderOverlay" min="0" max="70" step="5" value="${overlayPct}"/>
              </div>
            </div>
          </div>
          <button type="button" class="btn btn-primary btn-sm" id="saveBgBtn" style="margin-top:14px">${I18n.t('admin_slider_save_bg')}</button>
        </section>

        <div class="adm-toolbar" style="margin-top:22px">
          <h3 class="slider-sec-title" style="margin:0;flex:1">${I18n.t('admin_slider_slides')}</h3>
          <button type="button" class="btn btn-primary btn-sm" id="addSlideBtn">+ ${I18n.t('admin_slider_add')}</button>
        </div>
        <div class="adm-list-panel">
          ${
            promos.length
              ? `<div class="slider-slide-list">${promos
                  .map((p, i) => {
                    const tone = p.tone || 'sage';
                    const badge = UI.escapeHtml((p.badge && p.badge.ru) || '');
                    const title = UI.escapeHtml((p.title && p.title.ru) || '');
                    return `<div class="slider-slide-card" data-tone="${tone}">
                      <div class="slider-slide-meta">
                        <span class="slider-tone-dot" data-tone="${tone}"></span>
                        <div>
                          <div class="slider-slide-badge">${badge || '—'}</div>
                          <div class="slider-slide-title">${title || '—'}</div>
                        </div>
                      </div>
                      <div class="slider-slide-actions">
                        <button type="button" class="btn btn-ghost btn-sm" data-edit="${i}">${I18n.t('admin_edit')}</button>
                        <button type="button" class="btn btn-ghost btn-sm" data-del="${i}">✕</button>
                      </div>
                    </div>`;
                  })
                  .join('')}</div>`
              : `<p class="adm-empty">${I18n.t('admin_slider_add')}</p>`
          }
        </div>`;

      let draftBg = Object.assign({}, bg);

      content.querySelectorAll('input[name="bgMode"]').forEach((r) => {
        r.addEventListener('change', () => {
          draftBg.bgMode = r.value;
          const row = document.getElementById('sliderImageRow');
          if (row) row.hidden = draftBg.bgMode !== 'image';
        });
      });

      content.querySelectorAll('[data-preset]').forEach((btn) => {
        btn.addEventListener('click', () => {
          draftBg.preset = btn.dataset.preset;
          draftBg.bgMode = 'preset';
          content.querySelectorAll('input[name="bgMode"]').forEach((r) => {
            r.checked = r.value === 'preset';
          });
          const row = document.getElementById('sliderImageRow');
          if (row) row.hidden = true;
          content.querySelectorAll('.slider-preset-card').forEach((c) => {
            c.classList.toggle('is-active', c.dataset.preset === draftBg.preset);
          });
        });
      });

      const overlayEl = document.getElementById('sliderOverlay');
      const overlayVal = document.getElementById('overlayVal');
      if (overlayEl) {
        overlayEl.addEventListener('input', () => {
          draftBg.overlay = Number(overlayEl.value) / 100;
          if (overlayVal) overlayVal.textContent = overlayEl.value + '%';
        });
      }

      const fileEl = document.getElementById('sliderBgFile');
      if (fileEl) {
        fileEl.addEventListener('change', async (e) => {
          const f = e.target.files && e.target.files[0];
          if (!f) return;
          try {
            const dataUrl = await fileToDataURL(f);
            const up = await Api.uploadMedia(dataUrl, 'image/jpeg');
            draftBg.imageUrl = up.url || dataUrl;
            draftBg.bgMode = 'image';
            content.querySelectorAll('input[name="bgMode"]').forEach((r) => {
              r.checked = r.value === 'image';
            });
            const row = document.getElementById('sliderImageRow');
            if (row) row.hidden = false;
            const prev = document.getElementById('sliderImagePreview');
            if (prev) prev.style.backgroundImage = `url('${draftBg.imageUrl}')`;
          } catch (err) {
            UI.toast(err && err.message ? err.message : 'Error');
          }
        });
      }

      document.getElementById('saveBgBtn').addEventListener('click', async () => {
        const btn = document.getElementById('saveBgBtn');
        if (btn) btn.disabled = true;
        try {
          const latest = await Api.getSettings();
          latest.promoSlider = {
            bgMode: draftBg.bgMode === 'image' && draftBg.imageUrl ? 'image' : 'preset',
            preset: draftBg.preset || 'aurora',
            imageUrl: draftBg.imageUrl || '',
            overlay: Math.min(0.7, Math.max(0, Number(draftBg.overlay) || 0.35)),
          };
          settings = await Api.saveSettings(latest);
          if (Api.invalidateCache) Api.invalidateCache(['settings']);
          UI.toast(I18n.t('admin_saved'));
          listView();
        } catch (err) {
          UI.toast(err && err.message ? err.message : 'Error');
          if (btn) btn.disabled = false;
        }
      });

      document.getElementById('addSlideBtn').addEventListener('click', () => editView(null));
      content.querySelectorAll('[data-edit]').forEach((btn) => {
        btn.addEventListener('click', () => editView(Number(btn.dataset.edit)));
      });
      content.querySelectorAll('[data-del]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          if (!confirm(I18n.t('admin_slider_delete_confirm'))) return;
          const idx = Number(btn.dataset.del);
          const latest = await Api.getSettings();
          const list = Array.isArray(latest.promos) ? latest.promos.slice() : [];
          list.splice(idx, 1);
          latest.promos = list;
          settings = await Api.saveSettings(latest);
          if (Api.invalidateCache) Api.invalidateCache(['settings']);
          UI.toast(I18n.t('admin_deleted'));
          listView();
        });
      });
    }

    async function editView(index) {
      const promos = Array.isArray(settings.promos) ? settings.promos : [];
      const p = index != null && promos[index] ? promos[index] : null;
      const loc = (obj) => (obj && obj.ru) || '';
      const tone = (p && p.tone) || 'coral';

      content.innerHTML = `
        <h2 style="font-size:1.4rem; margin-bottom:18px;">${p ? I18n.t('admin_slider_edit') : I18n.t('admin_slider_add')}</h2>
        <p class="set-hint">${I18n.t('admin_auto_translate_hint')}</p>
        <form class="adm-form" id="slideForm">
          <div class="field">
            <label>${adminLabel(I18n.t('admin_slider_badge'), 'admin_help_slide_badge')}</label>
            <input id="slBadge" value="${UI.escapeHtml(loc(p && p.badge))}" placeholder="${I18n.t('admin_slide_badge_ph')}" required/>
          </div>
          <div class="field">
            <label>${adminLabel(I18n.t('admin_slider_title'), 'admin_help_slide_title')}</label>
            <input id="slTitle" value="${UI.escapeHtml(loc(p && p.title))}" placeholder="${I18n.t('admin_slide_title_ph')}" required/>
          </div>
          <div class="field full">
            <label>${adminLabel(I18n.t('admin_slider_text'), 'admin_help_slide_text')}</label>
            <textarea id="slText" rows="3" placeholder="${I18n.t('admin_slide_text_ph')}" required>${UI.escapeHtml(loc(p && p.text))}</textarea>
          </div>
          <div class="field">
            <label>${adminLabel(I18n.t('admin_slider_cta'), 'admin_help_slide_cta')}</label>
            <input id="slCta" value="${UI.escapeHtml(loc(p && p.cta))}" placeholder="${I18n.t('admin_slide_cta_ph')}" required/>
          </div>
          <div class="field">
            <label>${adminLabel(I18n.t('admin_slider_href'), 'admin_help_slide_href')}</label>
            <select id="slHref">${slideHrefOptions(p && p.href)}</select>
          </div>
          <div class="field full">
            <label>${adminLabel(I18n.t('admin_slider_tone'), 'admin_help_slide_tone')}</label>
            <div class="slider-tone-chips">
              ${TONES.map(
                (t) => `
                <label class="slider-tone-chip" data-tone="${t}">
                  <input type="radio" name="slTone" value="${t}" ${tone === t ? 'checked' : ''}/>
                  <span>${I18n.t(TONE_LABELS[t] || t)}</span>
                </label>`
              ).join('')}
            </div>
          </div>
          <div class="adm-toolbar" style="margin-top:8px">
            <button type="button" class="btn btn-ghost" id="slideBack">${I18n.t('admin_back')}</button>
            <button type="submit" class="btn btn-primary">${I18n.t('admin_save')}</button>
          </div>
        </form>`;

      bindAdminHelp(content);
      document.getElementById('slideBack').addEventListener('click', listView);
      document.getElementById('slideForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const ruBadge = document.getElementById('slBadge').value.trim();
        const ruTitle = document.getElementById('slTitle').value.trim();
        const ruText = document.getElementById('slText').value.trim();
        const ruCta = document.getElementById('slCta').value.trim();
        const href = document.getElementById('slHref').value.trim() || 'catalog.html';
        const toneEl = content.querySelector('input[name="slTone"]:checked');
        const nextTone = (toneEl && toneEl.value) || 'sage';
        if (!ruBadge || !ruTitle || !ruText || !ruCta) return;

        const submitBtn = e.target.querySelector('button[type="submit"]');
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = I18n.t('admin_translating');
        }

        const triOr = async (ru, prev) => {
          const same = prev && prev.ru === ru && (prev.en || prev.uz);
          if (same) return { ru, en: prev.en || ru, uz: prev.uz || ru };
          if (typeof Translate !== 'undefined') {
            try {
              return await Translate.fromRu(ru);
            } catch (_) {}
          }
          return { ru, en: ru, uz: ru };
        };

        try {
          const badge = await triOr(ruBadge, p && p.badge);
          const title = await triOr(ruTitle, p && p.title);
          const text = await triOr(ruText, p && p.text);
          const cta = await triOr(ruCta, p && p.cta);
          const latest = await Api.getSettings();
          const list = Array.isArray(latest.promos) ? latest.promos.slice() : [];
          const slide = {
            id: (p && p.id) || 'promo-' + Date.now().toString(36),
            tone: nextTone,
            badge,
            title,
            text,
            cta,
            href,
          };
          if (p && index != null) list[index] = slide;
          else list.push(slide);
          latest.promos = list;
          settings = await Api.saveSettings(latest);
          if (Api.invalidateCache) Api.invalidateCache(['settings']);
          UI.toast(I18n.t('admin_saved'));
          listView();
        } catch (err) {
          UI.toast(err && err.message ? err.message : 'Error');
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = I18n.t('admin_save');
          }
        }
      });
    }

    listView();
  }

  async function renderSettings() {
    settings = await Api.getSettings();
    const s = settings;

    const ml = (obj, keys) => {
      const o = obj || {};
      return keys.map((k) => UI.escapeHtml(o[k] || '')).reduce((acc, v, i) => {
        acc[keys[i]] = v;
        return acc;
      }, {});
    };
    const cardReq = ml(s.cardRequisites, ['ru', 'uz', 'en']);

    const packUi = (key) => {
      const over = (s.uiTexts && s.uiTexts[key]) || {};
      const pick = (lang) => {
        const v = over[lang] && String(over[lang]).trim();
        if (v) return v;
        const dict = (typeof TRANSLATIONS !== 'undefined' && TRANSLATIONS[lang]) || {};
        return dict[key] || (TRANSLATIONS.ru && TRANSLATIONS.ru[key]) || '';
      };
      return { ru: pick('ru'), uz: pick('uz'), en: pick('en') };
    };

    const langField = (label, values, attrs, area) => {
      const cell = (lang) => {
        const v = UI.escapeHtml((values && values[lang]) || '');
        const a = `${attrs} data-lang="${lang}" placeholder="${lang.toUpperCase()}"`;
        return area ? `<textarea ${a}>${v}</textarea>` : `<input ${a} value="${v}"/>`;
      };
      return `<div class="field full">
        <label>${label}</label>
        <div class="lang-cols">${cell('ru')}${cell('uz')}${cell('en')}</div>
      </div>`;
    };

    const contentGroupsHtml = SITE_TEXT_GROUPS.map((group, idx) => {
      const rows = group.fields.map((f) => {
        if (f.store) {
          return langField(f.label, s[f.store] || {}, `data-sfield="${f.store}"`, !!f.area);
        }
        return langField(f.label, packUi(f.key), `data-uitext="${f.key}"`, !!f.area);
      }).join('');
      return `<details class="set-subacc"${idx === 0 ? ' open' : ''}>
        <summary>${group.title}</summary>
        <div class="set-grid">${rows}</div>
      </details>`;
    }).join('');

    content.innerHTML = `
      <h2 style="font-size:1.4rem; margin-bottom:18px;">⚙️ ${I18n.t('admin_settings')}</h2>
      <form class="adm-form settings-form" id="setForm">
        <details class="set-acc" open>
          <summary>Магазин</summary>
          <p class="set-hint">Название, курс валют, реквизиты карты и точки самовывоза.</p>
          <div class="set-grid">
            <div class="field">
              <label>${I18n.t('admin_site_title')}</label>
              <input id="sName" value="${UI.escapeHtml(s.siteName || 'YoucanSmile')}"/>
            </div>
            <div class="field">
              <label>USD rate (UZS per $1)</label>
              <input id="sUsdRate" type="number" min="1" step="1" value="${Number(s.usdRate) || 12500}"/>
            </div>
            <div class="field">
              <label>Card number</label>
              <input id="sCardNumber" value="${UI.escapeHtml(s.cardNumber || '')}" placeholder="8600…"/>
            </div>
            <div class="field">
              <label>Card recipient</label>
              <input id="sCardRecipient" value="${UI.escapeHtml(s.cardRecipient || 'Mirsagatova Madina')}"/>
            </div>
            <div class="field full">
              <label>Card requisites (RU / UZ / EN)</label>
              <div class="lang-cols">
                <textarea id="sCardRu" placeholder="RU">${cardReq.ru}</textarea>
                <textarea id="sCardUz" placeholder="UZ">${cardReq.uz}</textarea>
                <textarea id="sCardEn" placeholder="EN">${cardReq.en}</textarea>
              </div>
            </div>
            <div class="field full">
              <label>Точки самовывоза</label>
              <p class="set-hint" style="margin-top:0">Клиент выбирает только эти точки — свой адрес самовывоза писать нельзя.</p>
              <div id="pickupPointsEditor" class="pickup-editor"></div>
              <button type="button" class="btn btn-ghost" id="pickupAddBtn" style="margin-top:10px">＋ Добавить точку</button>
            </div>
          </div>
        </details>

        <details class="set-acc">
          <summary>Контент</summary>
          <p class="set-hint">Все тексты сайта на RU / UZ / EN. Пустое поле вернёт стандартный перевод.</p>
          ${contentGroupsHtml}
        </details>

        <details class="set-acc">
          <summary>Контакты / пароль</summary>
          <p class="set-hint">Ссылки в футере и пароль входа в админку.</p>
          <div class="set-grid">
            <div class="field">
              <label>${I18n.t('admin_contact_telegram')}</label>
              <input id="sTg" placeholder="@username или https://t.me/..." value="${UI.escapeHtml((s.contacts && s.contacts.telegram) || '')}"/>
            </div>
            <div class="field">
              <label>${I18n.t('admin_contact_telegram_channel')}</label>
              <input id="sTgChannel" placeholder="@channel или https://t.me/..." value="${UI.escapeHtml(s.telegramChannel || '')}"/>
            </div>
            <div class="field">
              <label>${I18n.t('admin_contact_whatsapp')}</label>
              <input id="sWa" value="${UI.escapeHtml((s.contacts && s.contacts.whatsapp) || '')}"/>
            </div>
            <div class="field">
              <label>${I18n.t('admin_contact_email')}</label>
              <input id="sEmail" value="${UI.escapeHtml((s.contacts && s.contacts.email) || '')}"/>
            </div>
            <div class="field">
              <label>${I18n.t('admin_contact_instagram')}</label>
              <input id="sIg" value="${UI.escapeHtml((s.contacts && s.contacts.instagram) || '')}"/>
            </div>
            <div class="field">
              <label>${I18n.t('admin_admin_password')}</label>
              <input id="sPass" value="${UI.escapeHtml(s.adminPassword || '')}"/>
            </div>
          </div>
        </details>

        <div class="settings-savebar">
          <button class="btn btn-primary" type="submit">${I18n.t('admin_save')}</button>
        </div>
      </form>`;

    const pickupEditor = document.getElementById('pickupPointsEditor');
    const pickupAddBtn = document.getElementById('pickupAddBtn');

    function emptyTri() {
      return { ru: '', uz: '', en: '' };
    }

    function asTri(v) {
      if (v && typeof v === 'object') {
        return { ru: v.ru || '', uz: v.uz || '', en: v.en || '' };
      }
      const s0 = String(v || '');
      return { ru: s0, uz: s0, en: s0 };
    }

    function pickupCardHTML(pt) {
      const id = UI.escapeHtml(pt.id || '');
      const name = asTri(pt.name);
      const address = asTri(pt.address);
      const lat = pt.coords && pt.coords[0] != null ? pt.coords[0] : '';
      const lng = pt.coords && pt.coords[1] != null ? pt.coords[1] : '';
      return `
        <div class="pickup-card" data-pickup-id="${id}">
          <div class="pickup-card-head">
            <strong>Точка</strong>
            <button type="button" class="btn btn-ghost pickup-del" title="Удалить">Удалить</button>
          </div>
          <input type="hidden" data-pp="id" value="${id}"/>
          <div class="field full">
            <label>Название (RU / UZ / EN)</label>
            <div class="lang-cols">
              <input data-pp="name" data-lang="ru" placeholder="RU" value="${UI.escapeHtml(name.ru)}"/>
              <input data-pp="name" data-lang="uz" placeholder="UZ" value="${UI.escapeHtml(name.uz)}"/>
              <input data-pp="name" data-lang="en" placeholder="EN" value="${UI.escapeHtml(name.en)}"/>
            </div>
          </div>
          <div class="field full">
            <label>Адрес (RU / UZ / EN)</label>
            <div class="lang-cols">
              <input data-pp="address" data-lang="ru" placeholder="RU" value="${UI.escapeHtml(address.ru)}"/>
              <input data-pp="address" data-lang="uz" placeholder="UZ" value="${UI.escapeHtml(address.uz)}"/>
              <input data-pp="address" data-lang="en" placeholder="EN" value="${UI.escapeHtml(address.en)}"/>
            </div>
          </div>
          <div class="pickup-coords">
            <div class="field">
              <label>Широта</label>
              <input data-pp="lat" type="number" step="any" value="${UI.escapeHtml(String(lat))}" placeholder="41.3265"/>
            </div>
            <div class="field">
              <label>Долгота</label>
              <input data-pp="lng" type="number" step="any" value="${UI.escapeHtml(String(lng))}" placeholder="69.235"/>
            </div>
          </div>
        </div>`;
    }

    function renderPickupEditor(list) {
      if (!pickupEditor) return;
      const pts = Array.isArray(list) ? list : [];
      pickupEditor.innerHTML = pts.length
        ? pts.map((pt) => pickupCardHTML(pt)).join('')
        : '<p class="set-hint">Пока нет точек — добавьте хотя бы одну.</p>';
    }

    function readPickupPointsFromDom() {
      if (!pickupEditor) return [];
      return [...pickupEditor.querySelectorAll('.pickup-card')].map((card, idx) => {
        const idEl = card.querySelector('[data-pp="id"]');
        let id = (idEl && idEl.value.trim()) || '';
        if (!id) id = 'pp_' + Date.now().toString(36) + '_' + idx;
        const name = emptyTri();
        const address = emptyTri();
        card.querySelectorAll('[data-pp="name"]').forEach((el) => {
          if (el.dataset.lang) name[el.dataset.lang] = el.value.trim();
        });
        card.querySelectorAll('[data-pp="address"]').forEach((el) => {
          if (el.dataset.lang) address[el.dataset.lang] = el.value.trim();
        });
        const lat = Number(card.querySelector('[data-pp="lat"]')?.value);
        const lng = Number(card.querySelector('[data-pp="lng"]')?.value);
        const coords =
          Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
        return { id, name, address, coords };
      }).filter((pt) => pt.name.ru || pt.name.uz || pt.name.en || pt.address.ru);
    }

    renderPickupEditor(s.pickupPoints || []);
    pickupAddBtn?.addEventListener('click', () => {
      const current = readPickupPointsFromDom();
      current.push({
        id: 'pp_' + Date.now().toString(36),
        name: emptyTri(),
        address: emptyTri(),
        coords: [41.2995, 69.2401],
      });
      renderPickupEditor(current);
    });
    pickupEditor?.addEventListener('click', (ev) => {
      const btn = ev.target.closest('.pickup-del');
      if (!btn || !pickupEditor.contains(btn)) return;
      btn.closest('.pickup-card')?.remove();
      if (!pickupEditor.querySelector('.pickup-card')) {
        pickupEditor.innerHTML = '<p class="set-hint">Пока нет точек — добавьте хотя бы одну.</p>';
      }
    });

    document.getElementById('setForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const ns = {
        ...settings,
        siteName: document.getElementById('sName').value.trim(),
        currency: 'UZS',
        usdRate: Number(document.getElementById('sUsdRate').value) || 12500,
        cardNumber: document.getElementById('sCardNumber').value.replace(/\D/g, ''),
        cardRecipient: document.getElementById('sCardRecipient').value.trim() || 'Mirsagatova Madina',
        cardRequisites: {
          ru: document.getElementById('sCardRu').value.trim(),
          uz: document.getElementById('sCardUz').value.trim(),
          en: document.getElementById('sCardEn').value.trim(),
        },
        pickupPoints: readPickupPointsFromDom(),
        announcement: readLangGroup('data-sfield', 'announcement'),
        heroTitle: readLangGroup('data-sfield', 'heroTitle'),
        heroSubtitle: readLangGroup('data-sfield', 'heroSubtitle'),
        about: readLangGroup('data-sfield', 'about'),
        footerAbout: readLangGroup('data-sfield', 'footerAbout'),
        uiTexts: (() => {
          const next = Object.assign({}, settings.uiTexts || {});
          document.querySelectorAll('[data-uitext]').forEach((el) => {
            const key = el.dataset.uitext;
            const lang = el.dataset.lang;
            if (!key || !lang) return;
            if (!next[key] || typeof next[key] !== 'object') next[key] = { ru: '', uz: '', en: '' };
            next[key][lang] = el.value.trim();
          });
          return next;
        })(),
        contacts: {
          telegram: UI.normalizeContactHref('telegram', document.getElementById('sTg').value.trim()) || document.getElementById('sTg').value.trim(),
          whatsapp: UI.normalizeContactHref('whatsapp', document.getElementById('sWa').value.trim()) || document.getElementById('sWa').value.trim(),
          email: document.getElementById('sEmail').value.trim(),
          instagram: UI.normalizeContactHref('instagram', document.getElementById('sIg').value.trim()) || document.getElementById('sIg').value.trim(),
        },
        social: {
          telegram: UI.normalizeContactHref('telegram', document.getElementById('sTg').value.trim()) || document.getElementById('sTg').value.trim(),
          whatsapp: UI.normalizeContactHref('whatsapp', document.getElementById('sWa').value.trim()) || document.getElementById('sWa').value.trim(),
          instagram: UI.normalizeContactHref('instagram', document.getElementById('sIg').value.trim()) || document.getElementById('sIg').value.trim(),
        },
        telegramChannel: UI.normalizeContactHref('telegram', document.getElementById('sTgChannel').value.trim()) || document.getElementById('sTgChannel').value.trim(),
        adminPassword: document.getElementById('sPass').value,
      };
      settings = await Api.saveSettings(ns);
      if (typeof ThemeApply !== 'undefined') ThemeApply.run(settings);
      UI.toast(I18n.t('admin_saved'));
      setTimeout(() => location.reload(), 400);
    });
  }

  /* ============================ СТАРТ ======================= */
  (async () => {
    await Api.init();
    const me = await Api.getMe();
    if (me && me.role === 'admin') {
      enterApp();
      if (typeof YcsPush !== 'undefined') YcsPush.subscribe(true);
    }
  })();
})();
