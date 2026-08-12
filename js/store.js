/* ============================================================
   YoucanSmile — корзина, избранное, валюта
   ============================================================ */
const Store = (() => {
  const KEYS = { cart: 'ycs_cart', favs: 'ycs_favorites', displayCurrency: 'ycs_display_currency' };

  function read(key) {
    try {
      return JSON.parse(localStorage.getItem(key)) || [];
    } catch (e) {
      return [];
    }
  }
  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  return {
    getFavorites() {
      return read(KEYS.favs);
    },
    isFavorite(id) {
      return read(KEYS.favs).includes(id);
    },
    toggleFavorite(id) {
      let favs = read(KEYS.favs);
      if (favs.includes(id)) favs = favs.filter((f) => f !== id);
      else favs.unshift(id);
      write(KEYS.favs, favs);
      return favs.includes(id);
    },

    getCart() {
      return read(KEYS.cart);
    },
    countCart() {
      return read(KEYS.cart).reduce((s, i) => s + i.qty, 0);
    },
    addToCart(id, qty = 1) {
      let cart = read(KEYS.cart);
      const found = cart.find((i) => i.productId === id);
      if (found) found.qty += qty;
      else cart.unshift({ productId: id, qty });
      write(KEYS.cart, cart);
      return cart;
    },
    setQty(id, qty) {
      let cart = read(KEYS.cart);
      const found = cart.find((i) => i.productId === id);
      if (found) {
        found.qty = Math.max(1, qty);
        write(KEYS.cart, cart);
      }
      return cart;
    },
    removeFromCart(id) {
      write(KEYS.cart, read(KEYS.cart).filter((i) => i.productId !== id));
      return read(KEYS.cart);
    },
    clearCart() {
      write(KEYS.cart, []);
    },

    getDisplayCurrency() {
      try {
        return localStorage.getItem(KEYS.displayCurrency) === 'USD' ? 'USD' : 'UZS';
      } catch (e) {
        return 'UZS';
      }
    },
    setDisplayCurrency(code) {
      const c = code === 'USD' ? 'USD' : 'UZS';
      try {
        localStorage.setItem(KEYS.displayCurrency, c);
      } catch (e) {}
      return c;
    },

    /* amount always stored in UZS */
    formatPrice(n, settingsOrCurrency) {
      const amount = Number(n) || 0;
      let rate = 12500;
      if (settingsOrCurrency && typeof settingsOrCurrency === 'object') {
        rate = Number(settingsOrCurrency.usdRate) || 12500;
      }
      const display = this.getDisplayCurrency();
      if (display === 'USD') {
        const usd = amount / rate;
        return '$' + usd.toFixed(2);
      }
      const val = Math.round(amount);
      const lang = typeof I18n !== 'undefined' ? I18n.lang : 'ru';
      const symbol = lang === 'en' ? 'UZS' : lang === 'uz' ? "so'm" : 'сум';
      return val.toLocaleString('ru-RU').replace(/,/g, ' ') + ' ' + symbol;
    },
    discountPercent(p) {
      if (!p.oldPrice) return 0;
      return Math.round((1 - p.price / p.oldPrice) * 100);
    },
  };
})();
