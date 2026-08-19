/* ============================================================
   YoucanSmile — страница товара
   ============================================================ */
(async function initProduct() {
  document.documentElement.lang = I18n.lang;
  applyI18n();
  await Api.init();
  const id = new URLSearchParams(location.search).get('id');
  const [s, , product] = await Promise.all([
    Api.getSettings(),
    Promise.all([UI.renderHeader(), UI.renderFooter()]),
    Api.getProduct(id),
  ]);
  const grid = document.getElementById('pdGrid');

  if (!product) {
    grid.classList.remove('pd-loading');
    grid.removeAttribute('aria-busy');
    grid.innerHTML = `<div class="catalog-empty"><h3>${I18n.t('product_not_found')}</h3></div>`;
    return;
  }

  const cat = (await Api.getCategories()).find((c) => c.id === product.categoryId);
  const disc = Store.discountPercent(product);
  const fav = Store.isFavorite(product.id);
  const imgs = product.images && product.images.length ? product.images : [''];

  let activeImg = 0;

  function render() {
    const inStock = product.inStock;
    const html = `
      <div class="pd-gallery">
        <div class="pd-main">
          <img id="pdMainImg" src="${imgs[activeImg]}" alt="${UI.escapeHtml(I18n.txt(product.title))}"/>
        </div>
        ${imgs.length > 1 ? `
        <div class="pd-thumbs">
          ${imgs.map((img, i) => `<div class="pd-thumb ${i === activeImg ? 'active' : ''}" data-i="${i}"><img src="${img}" alt=""/></div>`).join('')}
        </div>` : ''}
      </div>
      <div class="pd-info">
        ${cat ? `<span class="pd-cat">${cat.icon || ''} ${UI.escapeHtml(I18n.txt(cat.name))}</span>` : ''}
        <h1>${UI.escapeHtml(I18n.txt(product.title))}</h1>
        <div class="pd-status">
          <span class="status-dot ${inStock ? '' : 'out'}">${inStock ? I18n.t('product_in_stock') : I18n.t('product_no_stock')}</span>
          <div id="pdRatingMount">${UI.ratingStars(0, 0)}</div>
        </div>
        <div class="pd-price">
          <b>${Store.formatPrice(product.price, s)}</b>
          ${product.oldPrice ? `<s>${Store.formatPrice(product.oldPrice, s)}</s>` : ''}
          ${disc > 0 ? `<span class="pd-save">${I18n.t('product_save')} ${disc}%</span>` : ''}
        </div>
        ${product.tags && product.tags.length ? `
        <div class="pd-tags">${product.tags.map((t) => `<span class="pd-tag">#${UI.escapeHtml(t)}</span>`).join('')}</div>` : ''}

        <div class="pd-qty-row">
          <span style="font-weight:700;">${I18n.t('product_qty')}:</span>
          <div class="qty">
            <button id="qtyMinus">−</button>
            <input type="number" id="qtyInput" value="1" min="1" max="99"/>
            <button id="qtyPlus">+</button>
          </div>
        </div>

        <div class="pd-buy-row">
          <button class="btn btn-primary btn-lg" id="addBtn" ${inStock ? '' : 'disabled'}>${I18n.t('product_add')}</button>
          <button class="btn btn-ghost btn-lg" id="buyBtn" ${inStock ? '' : 'disabled'}>${I18n.t('product_buy')}</button>
          <button class="btn btn-ghost btn-lg ${fav ? 'active' : ''}" id="favBtn">
            ${fav ? '♥ ' + I18n.t('product_fav_remove') : '♡ ' + I18n.t('product_fav_add')}
          </button>
        </div>

        <h3>${I18n.t('product_desc')}</h3>
        <p class="pd-desc">${UI.escapeHtml(I18n.txt(product.desc))}</p>
      </div>`;
    grid.innerHTML = html;
    grid.classList.remove('pd-loading');
    grid.removeAttribute('aria-busy');
    bind();
  }

  function bind() {
    if (imgs.length > 1) {
      grid.querySelectorAll('.pd-thumb').forEach((th) =>
        th.addEventListener('click', () => {
          activeImg = Number(th.dataset.i);
          grid.querySelectorAll('.pd-thumb').forEach((t) => t.classList.toggle('active', t === th));
          document.getElementById('pdMainImg').src = imgs[activeImg];
        })
      );
    }
    const qty = document.getElementById('qtyInput');
    const setQ = (v) => { qty.value = Math.max(1, Math.min(99, v)); };
    document.getElementById('qtyMinus').addEventListener('click', () => setQ(Number(qty.value) - 1));
    document.getElementById('qtyPlus').addEventListener('click', () => setQ(Number(qty.value) + 1));
    qty.addEventListener('change', () => setQ(Number(qty.value) || 1));

    document.getElementById('addBtn').addEventListener('click', () => {
      Store.addToCart(product.id, Number(qty.value));
      UI.toast(I18n.t('product_added'));
      UI.syncCounts();
    });
    document.getElementById('buyBtn').addEventListener('click', () => {
      Store.addToCart(product.id, Number(qty.value));
      UI.syncCounts();
      location.href = 'cart.html';
    });
    document.getElementById('favBtn').addEventListener('click', (e) => {
      const added = Store.toggleFavorite(product.id);
      UI.toast(added ? I18n.t('product_fav_added') : I18n.t('product_fav_removed'));
      UI.syncCounts();
      e.currentTarget.innerHTML = added ? '♥ ' + I18n.t('product_fav_remove') : '♡ ' + I18n.t('product_fav_add');
    });
  }

  function reviewErrorText(code) {
    const map = {
      no_order: 'review_err_order',
      no_phone: 'review_err_phone',
      no_rating: 'review_err_rating',
      order_not_found: 'review_err_not_found',
      order_cancelled: 'review_err_cancelled',
      not_in_order: 'review_err_not_bought',
      phone_mismatch: 'review_err_phone_mismatch',
      already_reviewed: 'review_err_already',
    };
    return I18n.t(map[code] || 'review_err_generic');
  }

  function starsPickHTML(value) {
    return [1, 2, 3, 4, 5]
      .map(
        (n) =>
          `<button type="button" class="star-btn${n <= value ? ' on' : ''}" data-star="${n}" aria-label="${n}">★</button>`
      )
      .join('');
  }

  async function renderProductReviews(prod) {
    const root = document.getElementById('pdReviews');
    if (!root) return;
    const list = await Api.getReviews(prod.id);
    const count = list.length;
    const avg = count ? list.reduce((sum, r) => sum + Number(r.rating), 0) / count : 0;
    const mount = document.getElementById('pdRatingMount');
    if (mount) mount.innerHTML = UI.ratingStars(avg, count);

    const params = new URLSearchParams(location.search);
    const preOrder = UI.escapeHtml((params.get('order') || '').replace(/^#/, '').trim());
    const items = list
      .map((r) => {
        const when = r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '';
        const name = r.author || I18n.t('review_guest');
        const stars = [1, 2, 3, 4, 5]
          .map((i) => `<span class="star${i <= r.rating ? ' on' : ''}">★</span>`)
          .join('');
        return `<article class="rev-item">
          <div class="rev-item-head">
            <b>${UI.escapeHtml(name)}</b>
            <span class="card-rating">${stars}</span>
            ${when ? `<time>${UI.escapeHtml(when)}</time>` : ''}
          </div>
          ${r.text ? `<p>${UI.escapeHtml(r.text)}</p>` : ''}
        </article>`;
      })
      .join('');

    root.innerHTML = `
      <div class="section-head">
        <h2>${I18n.t('review_title')}</h2>
      </div>
      <div class="rev-summary">${UI.ratingStars(avg, count)}</div>
      <div class="rev-list">${items || `<p class="rev-empty">${I18n.t('review_empty')}</p>`}</div>
      <form class="rev-form" id="revForm">
        <h3>${I18n.t('review_form_title')}</h3>
        <p class="cs-note">${I18n.t('review_form_hint')}</p>
        <div class="form-grid">
          <div class="field">
            <label for="revOrder">${I18n.t('review_order_id')}</label>
            <input id="revOrder" required value="${preOrder}" autocomplete="off"/>
          </div>
          <div class="field">
            <label for="revPhone">${I18n.t('order_phone')}</label>
            <input id="revPhone" type="tel" required value="+998 " autocomplete="tel"/>
          </div>
          <div class="field full">
            <label>${I18n.t('review_rating')}</label>
            <div class="star-pick" id="revStars" role="radiogroup">${starsPickHTML(0)}</div>
            <input type="hidden" id="revRating" value="0"/>
          </div>
          <div class="field full">
            <label for="revText">${I18n.t('review_text')}</label>
            <textarea id="revText" rows="4" data-ph-i18n="review_text_ph"></textarea>
          </div>
        </div>
        <p class="login-err hidden" id="revErr"></p>
        <button class="btn btn-primary" type="submit">${I18n.t('review_submit')}</button>
      </form>`;
    applyI18n(root);

    const starBox = document.getElementById('revStars');
    const ratingInput = document.getElementById('revRating');
    const paintStars = (n, persist) => {
      if (persist) ratingInput.value = String(n);
      starBox.querySelectorAll('[data-star]').forEach((b) => {
        b.classList.toggle('on', Number(b.dataset.star) <= n);
      });
    };
    starBox.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-star]');
      if (!btn) return;
      paintStars(Number(btn.dataset.star), true);
    });
    starBox.addEventListener('mouseover', (e) => {
      const btn = e.target.closest('[data-star]');
      if (!btn) return;
      paintStars(Number(btn.dataset.star), false);
    });
    starBox.addEventListener('mouseleave', () => {
      paintStars(Number(ratingInput.value) || 0, false);
    });

    document.getElementById('revForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl = document.getElementById('revErr');
      errEl.classList.add('hidden');
      const result = await Api.createReview({
        productId: prod.id,
        orderId: document.getElementById('revOrder').value,
        phone: document.getElementById('revPhone').value,
        rating: Number(document.getElementById('revRating').value),
        text: document.getElementById('revText').value,
      });
      if (!result.ok) {
        errEl.textContent = reviewErrorText(result.error);
        errEl.classList.remove('hidden');
        return;
      }
      UI.toast(I18n.t('review_thanks'));
      await renderProductReviews(prod);
    });
  }

  render();
  await renderProductReviews(product);

  /* похожие товары */
  const all = await Api.getProducts();
  const related = all.filter((p) => p.id !== product.id && p.categoryId === product.categoryId).slice(0, 4);
  const fill = related.length ? related : all.filter((p) => p.id !== product.id).slice(0, 4);
  await UI.renderGrid(document.getElementById('relatedGrid'), fill, s.currency);

  document.title = I18n.txt(product.title) + ' — YoucanSmile';
})();
